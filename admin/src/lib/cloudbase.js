const ENV_ID = 'cloud1-5gv1lgzd5ce068c7'
const REGION = 'ap-shanghai'
const CLOUD_FUNCTION_NAME = 'admin'
const SDK_URLS = [
  'https://static.cloudbase.net/cloudbase-js-sdk/2.0.0/cloudbase.full.js',
  'https://imgcache.qq.com/qcloud/cloudbase-js-sdk/2.0.0/cloudbase.full.js'
]

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
    const tryLoad = (index) => {
      if (window.cloudbase) {
        resolve(window.cloudbase)
        return
      }

      const url = SDK_URLS[index]
      if (!url) {
        reject(new Error('CloudBase SDK 加载失败'))
        return
      }

      const existing = document.querySelector(`script[data-cloudbase-sdk-url="${url}"]`)
      if (existing) {
        existing.addEventListener('load', () => {
          if (!window.cloudbase) {
            tryLoad(index + 1)
            return
          }
          resolve(window.cloudbase)
        })
        existing.addEventListener('error', () => tryLoad(index + 1))
        return
      }

      const script = document.createElement('script')
      script.src = url
      script.async = true
      script.dataset.cloudbaseSdk = 'true'
      script.dataset.cloudbaseSdkUrl = url
      script.onload = () => {
        if (!window.cloudbase) {
          tryLoad(index + 1)
          return
        }
        resolve(window.cloudbase)
      }
      script.onerror = () => tryLoad(index + 1)
      document.head.appendChild(script)
    }

    tryLoad(0)
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
          if (typeof auth.signInAnonymously === 'function') {
            await auth.signInAnonymously()
          } else if (typeof auth.anonymousAuthProvider === 'function') {
            await auth.anonymousAuthProvider().signIn()
          } else {
            throw new Error('当前 CloudBase SDK 不支持匿名登录')
          }
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
