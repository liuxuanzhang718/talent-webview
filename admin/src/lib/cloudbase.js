const ENV_ID = 'cloud1-5gv1lgzd5ce068c7'
const REGION = 'ap-shanghai'
const CLOUD_FUNCTION_NAME = 'admin'
const SDK_URL = 'https://static.cloudbase.net/cloudbase-js-sdk/3.0.1/cloudbase.full.js'

let appPromise = null
let authReadyPromise = null

function loadSdk() {
  if (window.cloudbase) {
    return Promise.resolve(window.cloudbase)
  }

  if (window.__talentCloudbaseSdkPromise) {
    return window.__talentCloudbaseSdkPromise
  }

  window.__talentCloudbaseSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-cloudbase-sdk="true"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.cloudbase))
      existing.addEventListener('error', () => reject(new Error('CloudBase SDK 加载失败')))
      return
    }

    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    script.dataset.cloudbaseSdk = 'true'
    script.onload = () => {
      if (!window.cloudbase) {
        reject(new Error('CloudBase SDK 未初始化'))
        return
      }
      resolve(window.cloudbase)
    }
    script.onerror = () => reject(new Error('CloudBase SDK 加载失败'))
    document.head.appendChild(script)
  })

  return window.__talentCloudbaseSdkPromise
}

export async function getCloudbaseApp() {
  if (!appPromise) {
    appPromise = loadSdk().then((cloudbase) => cloudbase.init({
      env: ENV_ID,
      region: REGION
    }))
  }

  return appPromise
}

export async function ensureCloudbaseReady() {
  if (!authReadyPromise) {
    authReadyPromise = (async () => {
      const app = await getCloudbaseApp()
      const auth = app.auth()

      try {
        const loginState = typeof auth.getLoginState === 'function'
          ? await auth.getLoginState()
          : null
        if (!loginState) {
          await auth.signInAnonymously()
        }
      } catch (err) {
        console.warn('[admin-web] CloudBase 匿名登录失败:', err)
      }

      return app
    })()
  }

  return authReadyPromise
}

export async function callAdminFunction(action, data = {}) {
  const app = await ensureCloudbaseReady()
  return app.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: {
      action,
      ...data
    },
    parse: true
  })
}

export async function uploadCloudFile({ cloudPath, file }) {
  const app = await ensureCloudbaseReady()
  return app.uploadFile({
    cloudPath,
    filePath: file
  })
}

export function getCloudbaseEnvId() {
  return ENV_ID
}
