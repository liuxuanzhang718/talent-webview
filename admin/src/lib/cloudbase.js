const ENV_ID = 'cloud1-5gv1lgzd5ce068c7'
const REGION = 'ap-shanghai'
const CLOUD_FUNCTION_NAME = 'admin'
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@cloudbase/js-sdk/+esm'

let appPromise = null
let authReadyPromise = null

async function loadSdk() {
  const sdkModule = await import(SDK_URL)
  return sdkModule.default || sdkModule
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
