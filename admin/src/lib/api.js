import { callAdminFunction, uploadCloudFile } from './cloudbase.js?v=20260405-admin-cachefix-1'

const SESSION_KEY = 'talent_admin_session_token'

export function getSessionToken() {
  return localStorage.getItem(SESSION_KEY) || ''
}

export function setSessionToken(token) {
  if (token) {
    localStorage.setItem(SESSION_KEY, token)
  } else {
    localStorage.removeItem(SESSION_KEY)
  }
}

function unwrapResult(res) {
  const payload = res && res.result ? res.result : res
  if (!payload) {
    throw new Error('后台服务无响应')
  }
  if (payload.code !== 0) {
    throw new Error(payload.msg || '后台请求失败')
  }
  return payload.data
}

function withSession(data = {}) {
  const sessionToken = getSessionToken()
  return sessionToken ? { sessionToken, ...data } : data
}

function safeFileName(name = '') {
  return String(name || '')
    .trim()
    .replace(/[^\w.\-()\u4e00-\u9fa5]+/g, '_')
    .slice(0, 120) || 'upload.dat'
}

export async function getBootstrapStatus() {
  return unwrapResult(await callAdminFunction('bootstrapStatus'))
}

export async function bootstrapAdmin(payload) {
  const data = unwrapResult(await callAdminFunction('bootstrapAdmin', payload))
  if (data.sessionToken) {
    setSessionToken(data.sessionToken)
  }
  return data
}

export async function login(payload) {
  const data = unwrapResult(await callAdminFunction('login', payload))
  if (data.sessionToken) {
    setSessionToken(data.sessionToken)
  }
  return data
}

export async function logout() {
  try {
    await unwrapResult(await callAdminFunction('logout', withSession()))
  } finally {
    setSessionToken('')
  }
}

export async function getMe() {
  return unwrapResult(await callAdminFunction('me', withSession()))
}

export async function getDashboard() {
  return unwrapResult(await callAdminFunction('dashboard', withSession()))
}

export async function listUsers(params = {}) {
  return unwrapResult(await callAdminFunction('listUsers', withSession(params)))
}

export async function getUserDetail(userId) {
  return unwrapResult(await callAdminFunction('getUserDetail', withSession({ userId })))
}

export async function listBookings(params = {}) {
  return unwrapResult(await callAdminFunction('listBookings', withSession(params)))
}

export async function updateBookingStatus(payload) {
  return unwrapResult(await callAdminFunction('updateBookingStatus', withSession(payload)))
}

export async function listSchedule() {
  return unwrapResult(await callAdminFunction('listSchedule', withSession()))
}

export async function saveTemplate(payload) {
  return unwrapResult(await callAdminFunction('saveTemplate', withSession(payload)))
}

export async function deleteTemplate(templateId) {
  return unwrapResult(await callAdminFunction('deleteTemplate', withSession({ templateId })))
}

export async function saveBusyBlock(payload) {
  return unwrapResult(await callAdminFunction('saveBusyBlock', withSession(payload)))
}

export async function deleteBusyBlock(busyBlockId) {
  return unwrapResult(await callAdminFunction('deleteBusyBlock', withSession({ busyBlockId })))
}

export async function refreshAvailability(days = 7) {
  return unwrapResult(await callAdminFunction('refreshAvailability', withSession({ days })))
}

export async function listPlans(params = {}) {
  return unwrapResult(await callAdminFunction('listPlans', withSession(params)))
}

export async function getPlanDetail(planId) {
  return unwrapResult(await callAdminFunction('getPlanDetail', withSession({ planId })))
}

export async function savePlanDraft(payload) {
  return unwrapResult(await callAdminFunction('savePlanDraft', withSession(payload)))
}

export async function publishPlan(payload) {
  return unwrapResult(await callAdminFunction('publishPlan', withSession(payload)))
}

export async function upsertPlanReport(payload) {
  return unwrapResult(await callAdminFunction('upsertPlanReport', withSession(payload)))
}

export async function uploadAdminFile(file, folder = 'admin-web') {
  const safeName = safeFileName(file && file.name)
  const cloudPath = `${folder}/${Date.now()}_${safeName}`
  const result = await uploadCloudFile({
    cloudPath,
    file
  })

  return result.fileID
}
