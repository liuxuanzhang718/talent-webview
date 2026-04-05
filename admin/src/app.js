import {
  bootstrapAdmin,
  deleteBusyBlock,
  deleteTemplate,
  getBootstrapStatus,
  getDashboard,
  getMe,
  getPlanDetail,
  getSessionToken,
  getUserDetail,
  listBookings,
  listPlans,
  listSchedule,
  listUsers,
  login,
  logout,
  publishPlan,
  refreshAvailability,
  saveBusyBlock,
  savePlanDraft,
  saveTemplate,
  setSessionToken,
  updateBookingStatus,
  uploadAdminFile,
  upsertPlanReport
} from './lib/api.js'

const appNode = document.getElementById('app')

const PAGE_META = {
  overview: {
    title: '运营总览',
    subtitle: '先把今天最需要处理的事情放到眼前。'
  },
  users: {
    title: '用户总览',
    subtitle: '按状态追踪用户从激活、测评、反馈到预约的整个闭环。'
  },
  bookings: {
    title: '预约管理',
    subtitle: '确认、完成、取消和备注都在这里集中处理。'
  },
  schedule: {
    title: '排期管理',
    subtitle: '维护可预约模板、忙碌时段，并一键刷新未来一周可约时段。'
  },
  plans: {
    title: '方案与报告',
    subtitle: '编辑个性化方案，归档 HTML / PDF 报告，维护交付版本。'
  }
}

const PLAN_FIELDS = [
  { key: 'who', title: '你是谁' },
  { key: 'talent', title: '天赋 × 你说的话' },
  { key: 'tension', title: '核心张力' },
  { key: 'direction', title: '方向分析' },
  { key: 'background', title: '背景资产' },
  { key: 'steps', title: '接下来三步' }
]

const DEFAULT_PLAN_CONTENT = PLAN_FIELDS.reduce((acc, item) => {
  acc[item.key] = ''
  return acc
}, {})

const state = {
  booting: true,
  bootstrapNeeded: false,
  page: getPageFromHash(),
  admin: null,
  sessionExpiresAt: '',
  toast: null,
  globalBusy: '',
  loading: {
    overview: false,
    users: false,
    userDetail: false,
    bookings: false,
    schedule: false,
    plans: false,
    planDetail: false
  },
  dashboard: null,
  users: {
    search: '',
    items: [],
    total: 0,
    selectedId: '',
    detail: null
  },
  bookings: {
    status: 'all',
    search: '',
    items: [],
    total: 0,
    selectedId: ''
  },
  schedule: {
    templates: [],
    busyBlocks: [],
    timeSlots: []
  },
  plans: {
    search: '',
    items: [],
    total: 0,
    selectedId: '',
    detail: null
  }
}

let toastTimer = null

function getPageFromHash() {
  const raw = window.location.hash.replace(/^#/, '').trim()
  return PAGE_META[raw] ? raw : 'overview'
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function nl2br(value) {
  return escapeHtml(value).replace(/\n/g, '<br />')
}

function formatDateTime(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function pad(num) {
  return String(num).padStart(2, '0')
}

function toLocalInputValue(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function statusLabel(status) {
  const map = {
    pending: '待确认',
    confirmed: '已确认',
    completed: '已完成',
    cancelled: '已取消',
    draft: '草稿',
    published: '已发布'
  }
  return map[status] || status || '—'
}

function statusPill(status) {
  const normalized = escapeHtml(status || 'draft')
  return `<span class="status-pill ${normalized}">${escapeHtml(statusLabel(status))}</span>`
}

function initials(name) {
  const text = String(name || '').trim()
  if (!text) {
    return 'TU'
  }
  return text.slice(0, 2).toUpperCase()
}

function currentPageMeta() {
  return PAGE_META[state.page] || PAGE_META.overview
}

function selectedBooking() {
  return state.bookings.items.find((item) => item.id === state.bookings.selectedId) || null
}

function selectedPlanSummary() {
  return state.plans.items.find((item) => item.id === state.plans.selectedId) || null
}

function showToast(message, type = 'success') {
  state.toast = {
    message,
    type
  }
  render()
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    state.toast = null
    render()
  }, 3600)
}

function setGlobalBusy(label) {
  state.globalBusy = label || ''
  render()
}

async function withBusy(label, task) {
  try {
    setGlobalBusy(label)
    return await task()
  } finally {
    setGlobalBusy('')
  }
}

async function initializeApp() {
  render()

  try {
    const bootstrap = await getBootstrapStatus()
    state.bootstrapNeeded = !!bootstrap.needsBootstrap

    const sessionToken = getSessionToken()
    if (sessionToken) {
      const me = await getMe()
      state.admin = me.admin
      state.sessionExpiresAt = me.sessionExpiresAt
      await loadPage(state.page, true)
    }
  } catch (err) {
    setSessionToken('')
    state.admin = null
    if (!state.bootstrapNeeded) {
      showToast(err.message || '初始化后台失败', 'error')
    }
  } finally {
    state.booting = false
    render()
  }
}

async function loadPage(page, force = false) {
  switch (page) {
    case 'overview':
      await loadDashboard(force)
      break
    case 'users':
      await loadUsers(force)
      break
    case 'bookings':
      await loadBookings(force)
      break
    case 'schedule':
      await loadSchedule(force)
      break
    case 'plans':
      await loadPlans(force)
      break
    default:
      break
  }
}

async function loadDashboard(force = false) {
  if (state.dashboard && !force) {
    return
  }

  state.loading.overview = true
  render()
  try {
    state.dashboard = await getDashboard()
  } finally {
    state.loading.overview = false
    render()
  }
}

async function loadUsers(force = false) {
  if (state.users.items.length > 0 && !force) {
    return
  }

  state.loading.users = true
  render()
  try {
    const data = await listUsers({
      search: state.users.search,
      limit: 120
    })
    state.users.items = data.items || []
    state.users.total = data.total || 0

    if (state.users.selectedId && !state.users.items.find((item) => item.id === state.users.selectedId)) {
      state.users.selectedId = ''
      state.users.detail = null
    }

    if (state.users.selectedId) {
      await loadUserDetail(state.users.selectedId)
    }
  } finally {
    state.loading.users = false
    render()
  }
}

async function loadUserDetail(userId) {
  if (!userId) {
    state.users.detail = null
    render()
    return
  }

  state.loading.userDetail = true
  render()
  try {
    state.users.detail = await getUserDetail(userId)
  } finally {
    state.loading.userDetail = false
    render()
  }
}

async function loadBookings(force = false) {
  if (state.bookings.items.length > 0 && !force) {
    return
  }

  state.loading.bookings = true
  render()
  try {
    const data = await listBookings({
      status: state.bookings.status === 'all' ? '' : state.bookings.status,
      search: state.bookings.search,
      limit: 120
    })
    state.bookings.items = data.items || []
    state.bookings.total = data.total || 0

    if (state.bookings.selectedId && !state.bookings.items.find((item) => item.id === state.bookings.selectedId)) {
      state.bookings.selectedId = ''
    }
  } finally {
    state.loading.bookings = false
    render()
  }
}

async function loadSchedule(force = false) {
  if (state.schedule.templates.length > 0 && !force) {
    return
  }

  state.loading.schedule = true
  render()
  try {
    const data = await listSchedule()
    state.schedule.templates = data.templates || []
    state.schedule.busyBlocks = data.busyBlocks || []
    state.schedule.timeSlots = data.timeSlots || []
  } finally {
    state.loading.schedule = false
    render()
  }
}

async function loadPlans(force = false) {
  if (state.plans.items.length > 0 && !force) {
    return
  }

  state.loading.plans = true
  render()
  try {
    const [plansData] = await Promise.all([
      listPlans({
        search: state.plans.search,
        limit: 120
      }),
      state.users.items.length > 0 ? Promise.resolve() : loadUsers(true)
    ])

    state.plans.items = plansData.items || []
    state.plans.total = plansData.total || 0

    if (state.plans.selectedId && !state.plans.items.find((item) => item.id === state.plans.selectedId)) {
      state.plans.selectedId = ''
      state.plans.detail = null
    }

    if (state.plans.selectedId) {
      await loadPlanDetail(state.plans.selectedId)
    }
  } finally {
    state.loading.plans = false
    render()
  }
}

async function loadPlanDetail(planId) {
  if (!planId) {
    state.plans.detail = null
    render()
    return
  }

  state.loading.planDetail = true
  render()
  try {
    state.plans.detail = await getPlanDetail(planId)
  } finally {
    state.loading.planDetail = false
    render()
  }
}

function render() {
  if (state.booting) {
    appNode.innerHTML = `<div class="auth-shell"><div class="page-loading">正在装载后台环境...</div></div>`
    return
  }

  appNode.innerHTML = state.admin ? renderShell() : renderAuth()
}

function renderAuth() {
  const hint = state.bootstrapNeeded
    ? '当前还没有管理员账户。先初始化一个后台账户，后续就用账号密码登录。'
    : '先登录后台，再集中处理预约、排期和方案交付。'

  return `
    <div class="auth-shell">
      <div class="auth-card">
        <section class="auth-brand">
          <div class="brand-chip">Talent Unlimited Admin</div>
          <div>
            <div class="eyebrow">Operator Console</div>
            <h1 class="brand-title">把飞书退到幕后，<br />把真正要管的事搬到台前。</h1>
          </div>
          <p class="brand-copy">
            这一版后台直接围绕日常动作来设计：先看待确认预约，再调整未来一周空档，最后处理个性化方案和报告归档。
          </p>
          <div class="brand-points">
            <div class="brand-point">预约状态、管理员备注和排期都由你自己的后台控制，不再被表格视图牵着走。</div>
            <div class="brand-point">静态前端可以直接挂 GitHub Pages，后端继续用当前云函数和数据库，不重做业务真源。</div>
          </div>
        </section>
        <section class="auth-panel">
          <div>
            <p class="eyebrow" style="color: var(--accent-strong)">Admin Access</p>
            <h2 class="panel-title">${state.bootstrapNeeded ? '初始化管理员' : '登录管理台'}</h2>
            <p class="panel-subtitle">${hint}</p>
          </div>
          ${state.bootstrapNeeded ? renderBootstrapForm() : renderLoginForm()}
        </section>
      </div>
      ${renderToast()}
    </div>
  `
}

function renderLoginForm() {
  return `
    <form class="form-grid" data-form="login">
      <div class="field">
        <label for="login-username">管理员账号</label>
        <input id="login-username" class="input" name="username" autocomplete="username" placeholder="例如：admin" required />
      </div>
      <div class="field">
        <label for="login-password">密码</label>
        <input id="login-password" class="input" name="password" autocomplete="current-password" type="password" placeholder="输入后台密码" required />
      </div>
      <div class="button-row">
        <button class="button button-primary" type="submit">进入管理台</button>
      </div>
    </form>
  `
}

function renderBootstrapForm() {
  return `
    <form class="form-grid" data-form="bootstrap">
      <div class="form-two">
        <div class="field">
          <label for="bootstrap-display-name">显示名称</label>
          <input id="bootstrap-display-name" class="input" name="displayName" placeholder="例如：运营后台" required />
        </div>
        <div class="field">
          <label for="bootstrap-username">管理员账号</label>
          <input id="bootstrap-username" class="input" name="username" autocomplete="username" placeholder="例如：admin" required />
        </div>
      </div>
      <div class="field">
        <label for="bootstrap-password">初始密码</label>
        <input id="bootstrap-password" class="input" name="password" autocomplete="new-password" type="password" placeholder="至少 8 位" required />
      </div>
      <p class="hint">初始化完成后会直接登录，后面请通过账号密码进入后台。</p>
      <div class="button-row">
        <button class="button button-accent" type="submit">创建管理员并登录</button>
      </div>
    </form>
  `
}

function renderShell() {
  const pageMeta = currentPageMeta()
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="brand-chip">Talent Unlimited</div>
          <div>
            <div class="eyebrow">Custom Admin</div>
            <h1 class="sidebar-title">管理动作<br />聚焦到一屏。</h1>
          </div>
          <p class="sidebar-copy">
            这一版管理台围绕真实运营动作来排布：先看用户和预约，再处理未来一周空档，最后完成方案与报告归档。
          </p>
          <nav class="nav-list">
            ${Object.keys(PAGE_META).map((page) => `
              <button class="nav-button ${state.page === page ? 'active' : ''}" data-action="navigate" data-page="${page}">
                ${escapeHtml(PAGE_META[page].title)}
              </button>
            `).join('')}
          </nav>
        </div>
        <div class="sidebar-footer">
          <div class="sidebar-meta">
            <span>当前管理员</span>
            <strong>${escapeHtml(state.admin.displayName || state.admin.username)}</strong>
            <span class="subtle mono">@${escapeHtml(state.admin.username)}</span>
            <span>会话到期：${escapeHtml(formatDateTime(state.sessionExpiresAt))}</span>
          </div>
          <div class="button-row">
            <button class="button button-secondary" data-action="reload-current">刷新当前页</button>
            <button class="button button-ghost" data-action="logout">退出登录</button>
          </div>
        </div>
      </aside>
      <main class="content-shell">
        <section class="content-topbar">
          <div class="content-title">
            <p class="eyebrow" style="color: var(--accent-strong)">Operator Panel</p>
            <h2>${escapeHtml(pageMeta.title)}</h2>
            <p>${escapeHtml(pageMeta.subtitle)}</p>
          </div>
          <div class="stack">
            ${state.globalBusy ? `<span class="chip">${escapeHtml(state.globalBusy)}</span>` : ''}
            <span class="chip">环境：cloud1-5gv1lgzd5ce068c7</span>
          </div>
        </section>
        ${renderCurrentPage()}
      </main>
      ${renderToast()}
    </div>
  `
}

function renderCurrentPage() {
  if (state.page === 'overview') {
    return renderOverview()
  }
  if (state.page === 'users') {
    return renderUsers()
  }
  if (state.page === 'bookings') {
    return renderBookings()
  }
  if (state.page === 'schedule') {
    return renderSchedule()
  }
  if (state.page === 'plans') {
    return renderPlans()
  }
  return ''
}

function renderOverview() {
  if (state.loading.overview && !state.dashboard) {
    return `<div class="card"><div class="page-loading">正在汇总后台关键指标...</div></div>`
  }

  const data = state.dashboard || {
    users: 0,
    assessments: 0,
    surveys: 0,
    bookings: {},
    plans: {},
    scheduling: {}
  }

  return `
    <div class="panel-grid">
      <section class="metric-grid">
        <article class="metric-card metric-accent">
          <span>累计用户</span>
          <strong>${data.users || 0}</strong>
        </article>
        <article class="metric-card">
          <span>完成测评</span>
          <strong>${data.assessments || 0}</strong>
        </article>
        <article class="metric-card metric-teal">
          <span>完成反馈</span>
          <strong>${data.surveys || 0}</strong>
        </article>
        <article class="metric-card">
          <span>当前可预约时段</span>
          <strong>${(data.scheduling && data.scheduling.activeSlots) || 0}</strong>
        </article>
      </section>

      <section class="split-grid">
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">预约漏斗</h3>
              <p class="card-copy">把待确认、已确认和已完成拆开看，优先盯住未处理积压。</p>
            </div>
          </div>
          <div class="metric-grid" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
            <div class="metric-card"><span>待确认</span><strong>${(data.bookings && data.bookings.pending) || 0}</strong></div>
            <div class="metric-card"><span>已确认</span><strong>${(data.bookings && data.bookings.confirmed) || 0}</strong></div>
            <div class="metric-card"><span>已完成</span><strong>${(data.bookings && data.bookings.completed) || 0}</strong></div>
            <div class="metric-card"><span>已取消</span><strong>${(data.bookings && data.bookings.cancelled) || 0}</strong></div>
          </div>
        </article>

        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">交付概况</h3>
              <p class="card-copy">方案草稿、已发布方案和排期配置放在同一屏，避免来回切系统。</p>
            </div>
          </div>
          <div class="mini-grid">
            <div class="meta-row"><span class="meta-key">草稿方案</span><span class="meta-value">${(data.plans && data.plans.draft) || 0}</span></div>
            <div class="meta-row"><span class="meta-key">已发布方案</span><span class="meta-value">${(data.plans && data.plans.published) || 0}</span></div>
            <div class="meta-row"><span class="meta-key">模板时段</span><span class="meta-value">${(data.scheduling && data.scheduling.templates) || 0}</span></div>
            <div class="meta-row"><span class="meta-key">忙碌时段</span><span class="meta-value">${(data.scheduling && data.scheduling.busyBlocks) || 0}</span></div>
          </div>
        </article>
      </section>

      <article class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">这版后台的工作方式</h3>
            <p class="card-copy">不是再造一套飞书映射，而是把真实运营动作直接做成可执行界面。</p>
          </div>
        </div>
        <div class="chip-list">
          <span class="chip">用户状态一屏追踪</span>
          <span class="chip">预约确认 / 完成 / 取消</span>
          <span class="chip">模板时段 + 忙碌时段</span>
          <span class="chip">未来一周可预约时段重算</span>
          <span class="chip">方案草稿 / 发布</span>
          <span class="chip">HTML / PDF 报告归档</span>
        </div>
      </article>
    </div>
  `
}

function renderUsers() {
  return `
    <div class="panel-grid">
      <section class="section-grid">
        <article class="table-card">
          <div class="card" style="padding-bottom: 0;">
            <div class="toolbar">
              <form class="toolbar-left" data-form="users-search">
                <input class="input" style="min-width: 280px" name="search" value="${escapeHtml(state.users.search)}" placeholder="按昵称 / 激活码 / 天赋类型搜索用户" />
                <button class="button button-secondary" type="submit">搜索</button>
              </form>
              <div class="toolbar-right">
                <span class="subtle">共 ${state.users.total} 人</span>
                <button class="button button-ghost" data-action="reload-users">刷新</button>
              </div>
            </div>
          </div>
          ${state.loading.users ? `<div class="page-loading">正在读取用户列表...</div>` : renderUsersTable()}
        </article>
        <aside class="detail-card">
          ${renderUserDetail()}
        </aside>
      </section>
    </div>
  `
}

function renderUsersTable() {
  if (!state.users.items.length) {
    return `<div class="empty-state">当前没有用户数据，或者搜索条件下没有匹配结果。</div>`
  }

  return `
    <div class="table-scroll">
      <table class="table">
        <thead>
          <tr>
            <th>用户</th>
            <th>激活码</th>
            <th>测评</th>
            <th>反馈</th>
            <th>最近预约</th>
            <th>天赋类型</th>
            <th>注册时间</th>
          </tr>
        </thead>
        <tbody>
          ${state.users.items.map((item) => `
            <tr class="${state.users.selectedId === item.id ? 'active' : ''}" data-action="select-user" data-id="${escapeHtml(item.id)}">
              <td>
                <strong>${escapeHtml(item.nickname)}</strong><br />
                <span class="subtle mono">${escapeHtml(item.source || 'direct')}</span>
              </td>
              <td class="mono">${escapeHtml(item.activationCode || '—')}</td>
              <td>${item.assessmentDone ? '已完成' : '未完成'}</td>
              <td>${item.surveyDone ? '已完成' : '未完成'}</td>
              <td>${item.latestBookingStatus ? statusPill(item.latestBookingStatus) : '<span class="subtle">—</span>'}</td>
              <td>${escapeHtml(item.latestTalentType || '—')}</td>
              <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderUserDetail() {
  if (state.loading.userDetail) {
    return `<div class="page-loading">正在读取用户详情...</div>`
  }

  if (!state.users.detail) {
    return `
      <div class="empty-state">
        从左侧选择一个用户，即可查看最近报告、预约历史和方案状态。
      </div>
    `
  }

  const { user, latestAssessment, bookings, plans } = state.users.detail
  return `
    <div class="detail-hero">
      <div class="avatar">${user.avatar ? `<img src="${escapeHtml(user.avatar)}" alt="${escapeHtml(user.nickname)}" />` : escapeHtml(initials(user.nickname))}</div>
      <div>
        <h3>${escapeHtml(user.nickname || '未命名用户')}</h3>
        <p class="mono">${escapeHtml(user._id)}</p>
      </div>
    </div>
    <div class="detail-meta">
      <div class="meta-row"><span class="meta-key">激活码</span><span class="meta-value mono">${escapeHtml(user.activation_code || '—')}</span></div>
      <div class="meta-row"><span class="meta-key">来源</span><span class="meta-value">${escapeHtml(user.source || user.last_source || 'direct')}</span></div>
      <div class="meta-row"><span class="meta-key">Survey 痛点</span><span class="meta-value">${escapeHtml(user.survey_pain || '—')}</span></div>
      <div class="meta-row"><span class="meta-key">最近报告</span><span class="meta-value">${latestAssessment ? `${escapeHtml(latestAssessment.talent_type || '—')} ${latestAssessment.reportUrl ? `· <a class="file-link" target="_blank" rel="noopener" href="${escapeHtml(latestAssessment.reportUrl)}">查看报告 JSON</a>` : ''}` : '暂无'}</span></div>
      <div class="meta-row"><span class="meta-key">预约历史</span><span class="meta-value">${bookings.length} 条</span></div>
      <div class="meta-row"><span class="meta-key">方案历史</span><span class="meta-value">${plans.length} 条</span></div>
    </div>
  `
}

function renderBookings() {
  const booking = selectedBooking()
  const statusTabs = ['all', 'pending', 'confirmed', 'completed', 'cancelled']

  return `
    <div class="panel-grid">
      <section class="section-grid">
        <article class="table-card">
          <div class="card" style="padding-bottom: 0;">
            <div class="toolbar">
              <form class="toolbar-left" data-form="bookings-search">
                <input class="input" style="min-width: 280px" name="search" value="${escapeHtml(state.bookings.search)}" placeholder="按昵称 / 联系方式 / 问题搜索预约" />
                <button class="button button-secondary" type="submit">搜索</button>
              </form>
              <div class="toolbar-right">
                ${statusTabs.map((status) => `
                  <button class="filter-chip ${state.bookings.status === status ? 'active' : ''}" data-action="filter-booking-status" data-status="${status}">
                    ${escapeHtml(status === 'all' ? '全部' : statusLabel(status))}
                  </button>
                `).join('')}
                <button class="button button-ghost" data-action="reload-bookings">刷新</button>
              </div>
            </div>
          </div>
          ${state.loading.bookings ? `<div class="page-loading">正在读取预约列表...</div>` : renderBookingsTable()}
        </article>
        <aside class="detail-card">
          ${booking ? renderBookingDetail(booking) : `<div class="empty-state">从左侧选择一条预约，就能在这里改状态和写备注。</div>`}
        </aside>
      </section>
    </div>
  `
}

function renderBookingsTable() {
  if (!state.bookings.items.length) {
    return `<div class="empty-state">当前没有匹配的预约记录。</div>`
  }

  return `
    <div class="table-scroll">
      <table class="table">
        <thead>
          <tr>
            <th>用户</th>
            <th>状态</th>
            <th>时段</th>
            <th>问题</th>
            <th>联系方式</th>
            <th>创建时间</th>
          </tr>
        </thead>
        <tbody>
          ${state.bookings.items.map((item) => `
            <tr class="${state.bookings.selectedId === item.id ? 'active' : ''}" data-action="select-booking" data-id="${escapeHtml(item.id)}">
              <td>
                <strong>${escapeHtml(item.nickname)}</strong><br />
                <span class="subtle">${escapeHtml(item.talentType || '暂无天赋类型')}</span>
              </td>
              <td>${statusPill(item.status)}</td>
              <td>${escapeHtml(item.slotLabel || '—')}</td>
              <td>${escapeHtml(item.question || '—')}</td>
              <td class="mono">${escapeHtml(item.contact || '—')}</td>
              <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderBookingDetail(booking) {
  return `
    <div class="detail-hero">
      <div class="avatar">${booking.avatar ? `<img src="${escapeHtml(booking.avatar)}" alt="${escapeHtml(booking.nickname)}" />` : escapeHtml(initials(booking.nickname))}</div>
      <div>
        <h3>${escapeHtml(booking.nickname)}</h3>
        <p>${statusPill(booking.status)} · ${escapeHtml(booking.slotLabel || '未设置')}</p>
      </div>
    </div>
    <div class="detail-meta">
      <div class="meta-row"><span class="meta-key">联系方式</span><span class="meta-value mono">${escapeHtml(booking.contact || '—')}</span></div>
      <div class="meta-row"><span class="meta-key">Survey 痛点</span><span class="meta-value">${escapeHtml(booking.surveyPain || '—')}</span></div>
      <div class="meta-row"><span class="meta-key">用户问题</span><span class="meta-value">${escapeHtml(booking.question || '—')}</span></div>
      <div class="meta-row"><span class="meta-key">创建时间</span><span class="meta-value">${escapeHtml(formatDateTime(booking.createdAt))}</span></div>
      <div class="meta-row"><span class="meta-key">管理员备注</span><span class="meta-value">${escapeHtml(booking.adminNote || '—')}</span></div>
    </div>
    <form class="form-grid" data-form="booking-status" data-id="${escapeHtml(booking.id)}">
      <div class="field">
        <label for="booking-admin-note">更新备注</label>
        <textarea id="booking-admin-note" class="textarea" name="adminNote" placeholder="写下确认细节、取消原因或解读完成备注">${escapeHtml(booking.adminNote || '')}</textarea>
      </div>
      <div class="button-group">
        <button class="button button-secondary" type="submit" data-intent="note">保存备注</button>
        <button class="button button-accent" type="submit" data-intent="confirmed">标记为已确认</button>
        <button class="button button-primary" type="submit" data-intent="completed">标记为已完成</button>
        <button class="button button-danger" type="submit" data-intent="cancelled">取消预约</button>
      </div>
    </form>
  `
}

function renderSchedule() {
  return `
    <div class="panel-grid">
      <section class="split-grid">
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">可预约模板</h3>
              <p class="card-copy">定义基础开放时间。未来一周的可预约时段会从这里生成。</p>
            </div>
          </div>
          ${renderTemplateForm()}
          <div class="table-scroll" style="margin-top: 18px;">
            ${renderTemplateTable()}
          </div>
        </article>
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">忙碌时段</h3>
              <p class="card-copy">把真正占用的时间块写进来，再用一键刷新重算未来一周可预约时段。</p>
            </div>
          </div>
          ${renderBusyBlockForm()}
          <div class="table-scroll" style="margin-top: 18px;">
            ${renderBusyBlockTable()}
          </div>
        </article>
      </section>

      <article class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">未来一周可预约时段</h3>
            <p class="card-copy">小程序端真正展示给用户的是这里这批时段。</p>
          </div>
          <div class="button-group">
            <button class="button button-primary" data-action="refresh-availability">重算未来一周</button>
            <button class="button button-ghost" data-action="reload-schedule">刷新排期数据</button>
          </div>
        </div>
        ${state.loading.schedule ? `<div class="page-loading">正在读取排期数据...</div>` : renderTimeSlots()}
      </article>
    </div>
  `
}

function renderTemplateForm() {
  return `
    <form class="form-grid" data-form="template">
      <input type="hidden" name="templateId" />
      <div class="form-two">
        <div class="field">
          <label>展示文案</label>
          <input class="input" name="label" placeholder="例如：周三 19:00" />
        </div>
        <div class="field">
          <label>时间</label>
          <input class="input" name="time" type="time" required />
        </div>
      </div>
      <div class="form-two">
        <div class="field">
          <label>星期</label>
          <select class="select" name="dayOfWeek">
            ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map((label, index) => `<option value="${index}">${label}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>容量</label>
          <input class="input" name="capacity" type="number" min="1" step="1" value="1" />
        </div>
      </div>
      <div class="field">
        <label><input type="checkbox" name="enabled" checked /> 启用该模板</label>
      </div>
      <div class="button-group">
        <button class="button button-primary" type="submit">保存模板</button>
        <button class="button button-ghost" type="button" data-action="reset-template-form">清空表单</button>
      </div>
    </form>
  `
}

function renderTemplateTable() {
  if (!state.schedule.templates.length) {
    return `<div class="empty-state">还没有模板时段，先新增一个基础开放时间。</div>`
  }

  return `
    <table class="table">
      <thead>
        <tr>
          <th>模板</th>
          <th>容量</th>
          <th>状态</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${state.schedule.templates.map((template) => `
          <tr>
            <td>
              <strong>${escapeHtml(template.label || '未命名模板')}</strong><br />
              <span class="subtle mono">${escapeHtml(template._id)}</span>
            </td>
            <td>${escapeHtml(String(template.capacity || 1))}</td>
            <td>${template.enabled === false ? '禁用' : '启用'}</td>
            <td>
              <div class="button-group">
                <button class="button button-link" data-action="edit-template" data-id="${escapeHtml(template._id)}">编辑</button>
                <button class="button button-link" data-action="delete-template" data-id="${escapeHtml(template._id)}">删除</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

function renderBusyBlockForm() {
  return `
    <form class="form-grid" data-form="busy-block">
      <input type="hidden" name="busyBlockId" />
      <div class="field">
        <label>忙碌标题</label>
        <input class="input" name="title" placeholder="例如：外出咨询 / 团队会议" />
      </div>
      <div class="field">
        <label>原因</label>
        <input class="input" name="reason" placeholder="例如：客户会谈" />
      </div>
      <div class="form-two">
        <div class="field">
          <label>开始时间</label>
          <input class="input" name="startAt" type="datetime-local" required />
        </div>
        <div class="field">
          <label>结束时间</label>
          <input class="input" name="endAt" type="datetime-local" required />
        </div>
      </div>
      <div class="field">
        <label>备注</label>
        <textarea class="textarea" name="note" placeholder="给自己或团队的说明，不会暴露给用户"></textarea>
      </div>
      <div class="field">
        <label><input type="checkbox" name="enabled" checked /> 该忙碌时段生效</label>
      </div>
      <div class="button-group">
        <button class="button button-primary" type="submit">保存忙碌时段</button>
        <button class="button button-ghost" type="button" data-action="reset-busy-form">清空表单</button>
      </div>
    </form>
  `
}

function renderBusyBlockTable() {
  if (!state.schedule.busyBlocks.length) {
    return `<div class="empty-state">现在还没有忙碌时段。你可以把下周已有安排先框进去。</div>`
  }

  return `
    <table class="table">
      <thead>
        <tr>
          <th>时段</th>
          <th>标题</th>
          <th>状态</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${state.schedule.busyBlocks.map((block) => `
          <tr>
            <td>${escapeHtml(formatDateTime(block.start_at))}<br /><span class="subtle">至 ${escapeHtml(formatDateTime(block.end_at))}</span></td>
            <td><strong>${escapeHtml(block.title || '未命名忙碌时段')}</strong><br /><span class="subtle">${escapeHtml(block.reason || '')}</span></td>
            <td>${block.enabled === false ? '禁用' : '生效'}</td>
            <td>
              <div class="button-group">
                <button class="button button-link" data-action="edit-busy" data-id="${escapeHtml(block._id)}">编辑</button>
                <button class="button button-link" data-action="delete-busy" data-id="${escapeHtml(block._id)}">删除</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

function renderTimeSlots() {
  if (!state.schedule.timeSlots.length) {
    return `<div class="empty-state">当前没有未来一周可预约时段。先配置模板，再手动刷新一次。</div>`
  }

  return `
    <div class="slots-grid">
      ${state.schedule.timeSlots.map((slot) => `
        <div class="slot-card">
          <strong>${escapeHtml(slot.label || slot.slot_time || '未命名时段')}</strong>
          <span>${escapeHtml(formatDateTime(slot.slot_start_at || slot.slot_time))}</span>
          <span>容量：${escapeHtml(String(slot.capacity || 1))}</span>
          <span class="mono">${escapeHtml(slot.source || 'manual')}</span>
        </div>
      `).join('')}
    </div>
  `
}

function renderPlans() {
  const selectedPlan = state.plans.detail ? state.plans.detail.plan : null
  const userOptions = state.users.items.map((user) => `
    <option value="${escapeHtml(user.id)}" ${selectedPlan && selectedPlan.user_id === user.id ? 'selected' : ''}>
      ${escapeHtml(user.nickname)} ${user.activationCode ? `(${escapeHtml(user.activationCode)})` : ''}
    </option>
  `).join('')

  const currentContent = {
    ...DEFAULT_PLAN_CONTENT,
    ...(selectedPlan && selectedPlan.content ? selectedPlan.content : {})
  }
  const reportUrl = selectedPlan ? selectedPlan.html_report_url || '' : ''
  const reportVersion = selectedPlan ? selectedPlan.report_version || '' : ''
  const reportNote = selectedPlan ? selectedPlan.report_note || '' : ''

  return `
    <div class="panel-grid">
      <section class="section-grid">
        <article class="table-card">
          <div class="card" style="padding-bottom: 0;">
            <div class="toolbar">
              <form class="toolbar-left" data-form="plans-search">
                <input class="input" style="min-width: 280px" name="search" value="${escapeHtml(state.plans.search)}" placeholder="按用户 / 报告版本 / 备注搜索方案" />
                <button class="button button-secondary" type="submit">搜索</button>
              </form>
              <div class="toolbar-right">
                <button class="button button-secondary" data-action="new-plan">新建草稿</button>
                <button class="button button-ghost" data-action="reload-plans">刷新</button>
              </div>
            </div>
          </div>
          ${state.loading.plans ? `<div class="page-loading">正在读取方案列表...</div>` : renderPlansTable()}
        </article>
        <aside class="detail-card">
          <div class="card-header" style="margin-bottom: 0;">
            <div>
              <h3 class="card-title">${selectedPlan ? '编辑当前方案' : '新建方案草稿'}</h3>
              <p class="card-copy">${selectedPlan ? '方案内容和报告归档都在这里维护。' : '先选用户，再填写 6 个模块内容。'}</p>
            </div>
          </div>
          ${state.loading.planDetail ? `<div class="page-loading">正在读取方案详情...</div>` : `
            ${selectedPlan ? renderPlanSummary() : ''}
            <form class="form-grid" data-form="plan-editor">
              <input type="hidden" name="planId" value="${escapeHtml(selectedPlan ? selectedPlan._id : '')}" />
              <div class="form-two">
                <div class="field">
                  <label>所属用户</label>
                  <select class="select" name="userId" ${selectedPlan ? 'disabled' : ''} required>
                    <option value="">请选择用户</option>
                    ${userOptions}
                  </select>
                </div>
                <div class="field">
                  <label>关联预约 ID</label>
                  <input class="input mono" name="bookingId" value="${escapeHtml(selectedPlan ? selectedPlan.booking_id || '' : '')}" placeholder="可选" />
                </div>
              </div>
              ${PLAN_FIELDS.map((field) => `
                <div class="field">
                  <label>${escapeHtml(field.title)}</label>
                  <textarea class="textarea" name="content_${field.key}" placeholder="填写${escapeHtml(field.title)}">${escapeHtml(currentContent[field.key] || '')}</textarea>
                </div>
              `).join('')}
              <div class="button-group">
                <button class="button button-secondary" type="submit" data-intent="draft">保存草稿</button>
                <button class="button button-primary" type="submit" data-intent="publish">直接发布</button>
              </div>
            </form>

            ${selectedPlan ? `
              <div class="card" style="padding: 18px; background: var(--panel-strong);">
                <div class="card-header">
                  <div>
                    <h3 class="card-title">报告归档</h3>
                    <p class="card-copy">HTML 链接与 HTML / PDF 附件都在这里维护。</p>
                  </div>
                </div>
                <form class="form-grid" data-form="plan-report">
                  <input type="hidden" name="planId" value="${escapeHtml(selectedPlan._id)}" />
                  <div class="field">
                    <label>HTML 报告链接</label>
                    <input class="input" name="htmlReportUrl" value="${escapeHtml(reportUrl)}" placeholder="https://..." />
                  </div>
                  <div class="form-two">
                    <div class="field">
                      <label>报告版本</label>
                      <input class="input" name="reportVersion" value="${escapeHtml(reportVersion)}" placeholder="例如：v1.0" />
                    </div>
                    <div class="field">
                      <label>HTML 报告文件</label>
                      <input class="input" name="htmlFile" type="file" accept=".html,text/html" />
                    </div>
                  </div>
                  <div class="field">
                    <label>PDF 报告文件</label>
                    <input class="input" name="pdfFile" type="file" accept=".pdf,application/pdf" />
                  </div>
                  <div class="field">
                    <label>说明</label>
                    <textarea class="textarea" name="reportNote" placeholder="记录这个版本的用途、发送时间或特别说明">${escapeHtml(reportNote)}</textarea>
                  </div>
                  <div class="button-group">
                    <button class="button button-accent" type="submit">保存报告归档</button>
                    ${(selectedPlan.html_report_temp_url || selectedPlan.html_report_url) ? `<a class="button button-ghost" target="_blank" rel="noopener" href="${escapeHtml(selectedPlan.html_report_temp_url || selectedPlan.html_report_url)}">打开 HTML</a>` : ''}
                    ${selectedPlan.pdf_report_temp_url ? `<a class="button button-ghost" target="_blank" rel="noopener" href="${escapeHtml(selectedPlan.pdf_report_temp_url)}">打开 PDF</a>` : ''}
                  </div>
                </form>
              </div>
            ` : ''}
          `}
        </aside>
      </section>
    </div>
  `
}

function renderPlansTable() {
  if (!state.plans.items.length) {
    return `<div class="empty-state">现在还没有方案。你可以先在右侧直接新建一个草稿。</div>`
  }

  return `
    <div class="table-scroll">
      <table class="table">
        <thead>
          <tr>
            <th>用户</th>
            <th>状态</th>
            <th>版本</th>
            <th>报告版本</th>
            <th>更新时间</th>
          </tr>
        </thead>
        <tbody>
          ${state.plans.items.map((item) => `
            <tr class="${state.plans.selectedId === item.id ? 'active' : ''}" data-action="select-plan" data-id="${escapeHtml(item.id)}">
              <td><strong>${escapeHtml(item.nickname)}</strong><br /><span class="subtle mono">${escapeHtml(item.id)}</span></td>
              <td>${statusPill(item.status)}</td>
              <td>${escapeHtml(String(item.version || 0))}</td>
              <td>${escapeHtml(item.reportVersion || '—')}</td>
              <td>${escapeHtml(formatDateTime(item.updatedAt || item.publishedAt))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderPlanSummary() {
  if (!state.plans.detail) {
    return ''
  }

  const { plan, user, booking } = state.plans.detail
  return `
    <div class="detail-meta">
      <div class="meta-row"><span class="meta-key">方案状态</span><span class="meta-value">${statusPill(plan.status)}</span></div>
      <div class="meta-row"><span class="meta-key">用户</span><span class="meta-value">${escapeHtml((user && user.nickname) || '—')}</span></div>
      <div class="meta-row"><span class="meta-key">预约时段</span><span class="meta-value">${escapeHtml((booking && (booking.slot_label || booking.slot_time)) || '—')}</span></div>
      <div class="meta-row"><span class="meta-key">已上传版本</span><span class="meta-value">${escapeHtml(plan.report_version || '—')}</span></div>
      <div class="meta-row"><span class="meta-key">报告说明</span><span class="meta-value">${escapeHtml(plan.report_note || '—')}</span></div>
    </div>
  `
}

function renderToast() {
  if (!state.toast) {
    return ''
  }

  return `
    <div class="toast ${state.toast.type}">
      ${escapeHtml(state.toast.message)}
    </div>
  `
}

async function handleLogin(form) {
  const formData = new FormData(form)
  const payload = {
    username: formData.get('username'),
    password: formData.get('password')
  }

  const result = await withBusy('正在登录后台...', () => login(payload))
  state.admin = result.admin
  state.sessionExpiresAt = result.expiresAt || ''
  state.page = getPageFromHash()
  render()
  showToast('登录成功')
  await loadPage(state.page, true)
}

async function handleBootstrap(form) {
  const formData = new FormData(form)
  const payload = {
    displayName: formData.get('displayName'),
    username: formData.get('username'),
    password: formData.get('password')
  }

  const result = await withBusy('正在创建管理员账户...', () => bootstrapAdmin(payload))
  state.bootstrapNeeded = false
  state.admin = result.admin
  state.sessionExpiresAt = result.expiresAt || ''
  state.page = 'overview'
  render()
  showToast('管理员账户初始化完成')
  await loadPage('overview', true)
}

async function handleUsersSearch(form) {
  const formData = new FormData(form)
  state.users.search = String(formData.get('search') || '').trim()
  await loadUsers(true)
}

async function handleBookingsSearch(form) {
  const formData = new FormData(form)
  state.bookings.search = String(formData.get('search') || '').trim()
  await loadBookings(true)
}

async function handlePlansSearch(form) {
  const formData = new FormData(form)
  state.plans.search = String(formData.get('search') || '').trim()
  await loadPlans(true)
}

async function handleBookingStatus(form, submitter) {
  const booking = selectedBooking()
  if (!booking) {
    throw new Error('请先选择预约')
  }

  const formData = new FormData(form)
  const intent = submitter && submitter.dataset.intent ? submitter.dataset.intent : 'note'
  const payload = {
    bookingId: booking.id,
    adminNote: formData.get('adminNote')
  }

  if (intent !== 'note') {
    payload.nextStatus = intent
  } else {
    payload.nextStatus = booking.status
  }

  await withBusy('正在更新预约状态...', () => updateBookingStatus(payload))
  showToast(intent === 'note' ? '备注已保存' : `预约已更新为${statusLabel(intent)}`)
  await loadBookings(true)
}

async function handleTemplateSubmit(form) {
  const formData = new FormData(form)
  await withBusy('正在保存模板...', () => saveTemplate({
    templateId: formData.get('templateId'),
    label: formData.get('label'),
    time: formData.get('time'),
    dayOfWeek: Number(formData.get('dayOfWeek')),
    capacity: Number(formData.get('capacity') || 1),
    enabled: formData.get('enabled') === 'on'
  }))
  form.reset()
  form.querySelector('[name="templateId"]').value = ''
  showToast('模板已保存')
  await loadSchedule(true)
}

async function handleBusyBlockSubmit(form) {
  const formData = new FormData(form)
  await withBusy('正在保存忙碌时段...', () => saveBusyBlock({
    busyBlockId: formData.get('busyBlockId'),
    title: formData.get('title'),
    reason: formData.get('reason'),
    note: formData.get('note'),
    startAt: formData.get('startAt'),
    endAt: formData.get('endAt'),
    enabled: formData.get('enabled') === 'on'
  }))
  form.reset()
  form.querySelector('[name="busyBlockId"]').value = ''
  showToast('忙碌时段已保存')
  await loadSchedule(true)
}

async function handlePlanEditorSubmit(form, submitter) {
  const formData = new FormData(form)
  const intent = submitter && submitter.dataset.intent ? submitter.dataset.intent : 'draft'
  const content = PLAN_FIELDS.reduce((acc, field) => {
    acc[field.key] = String(formData.get(`content_${field.key}`) || '').trim()
    return acc
  }, {})

  const payload = {
    planId: formData.get('planId'),
    userId: formData.get('userId'),
    bookingId: formData.get('bookingId'),
    content
  }

  const result = intent === 'publish'
    ? await withBusy('正在发布方案...', () => publishPlan(payload))
    : await withBusy('正在保存方案草稿...', () => savePlanDraft(payload))

  state.plans.selectedId = result._id
  showToast(intent === 'publish' ? '方案已发布' : '草稿已保存')
  await loadPlans(true)
  await loadPlanDetail(result._id)
}

async function handlePlanReportSubmit(form) {
  const formData = new FormData(form)
  const planId = String(formData.get('planId') || '').trim()
  if (!planId) {
    throw new Error('请先选择方案')
  }

  const htmlFile = form.querySelector('[name="htmlFile"]').files[0]
  const pdfFile = form.querySelector('[name="pdfFile"]').files[0]

  let htmlReportFileId = ''
  let pdfReportFileId = ''

  if (htmlFile) {
    htmlReportFileId = await withBusy('正在上传 HTML 报告...', () => uploadAdminFile(htmlFile, `plan-reports/${planId}/html`))
  }

  if (pdfFile) {
    pdfReportFileId = await withBusy('正在上传 PDF 报告...', () => uploadAdminFile(pdfFile, `plan-reports/${planId}/pdf`))
  }

  const payload = {
    planId,
    htmlReportUrl: formData.get('htmlReportUrl'),
    reportVersion: formData.get('reportVersion'),
    reportNote: formData.get('reportNote')
  }

  if (htmlReportFileId) {
    payload.htmlReportFileId = htmlReportFileId
  }

  if (pdfReportFileId) {
    payload.pdfReportFileId = pdfReportFileId
  }

  await withBusy('正在保存报告归档...', () => upsertPlanReport(payload))

  showToast('报告归档已更新')
  await loadPlans(true)
  await loadPlanDetail(planId)
}

async function handleClick(event) {
  const trigger = event.target.closest('[data-action]')
  if (!trigger) {
    return
  }

  const action = trigger.dataset.action

  try {
    if (action === 'navigate') {
      const page = trigger.dataset.page
      if (page && PAGE_META[page]) {
        state.page = page
        window.location.hash = page
        render()
        await loadPage(page)
      }
      return
    }

    if (action === 'logout') {
      await withBusy('正在退出登录...', () => logout())
      state.admin = null
      state.sessionExpiresAt = ''
      state.dashboard = null
      render()
      showToast('已退出后台')
      return
    }

    if (action === 'reload-current') {
      await loadPage(state.page, true)
      showToast('当前页面已刷新')
      return
    }

    if (action === 'reload-users') {
      await loadUsers(true)
      showToast('用户列表已刷新')
      return
    }

    if (action === 'reload-bookings') {
      await loadBookings(true)
      showToast('预约列表已刷新')
      return
    }

    if (action === 'reload-schedule') {
      await loadSchedule(true)
      showToast('排期数据已刷新')
      return
    }

    if (action === 'reload-plans') {
      await loadPlans(true)
      showToast('方案列表已刷新')
      return
    }

    if (action === 'select-user') {
      state.users.selectedId = trigger.dataset.id || ''
      render()
      await loadUserDetail(state.users.selectedId)
      return
    }

    if (action === 'filter-booking-status') {
      state.bookings.status = trigger.dataset.status || 'all'
      await loadBookings(true)
      return
    }

    if (action === 'select-booking') {
      state.bookings.selectedId = trigger.dataset.id || ''
      render()
      return
    }

    if (action === 'edit-template') {
      const template = state.schedule.templates.find((item) => item._id === trigger.dataset.id)
      const form = document.querySelector('[data-form="template"]')
      if (template && form) {
        form.querySelector('[name="templateId"]').value = template._id || ''
        form.querySelector('[name="label"]').value = template.label || ''
        form.querySelector('[name="time"]').value = template.time || ''
        form.querySelector('[name="dayOfWeek"]').value = String(template.day_of_week ?? 1)
        form.querySelector('[name="capacity"]').value = String(template.capacity || 1)
        form.querySelector('[name="enabled"]').checked = template.enabled !== false
      }
      return
    }

    if (action === 'reset-template-form') {
      const form = document.querySelector('[data-form="template"]')
      if (form) {
        form.reset()
        form.querySelector('[name="templateId"]').value = ''
        form.querySelector('[name="capacity"]').value = '1'
        form.querySelector('[name="enabled"]').checked = true
      }
      return
    }

    if (action === 'delete-template') {
      if (!window.confirm('确认删除这个可预约模板？')) {
        return
      }
      await withBusy('正在删除模板...', () => deleteTemplate(trigger.dataset.id))
      showToast('模板已删除')
      await loadSchedule(true)
      return
    }

    if (action === 'edit-busy') {
      const block = state.schedule.busyBlocks.find((item) => item._id === trigger.dataset.id)
      const form = document.querySelector('[data-form="busy-block"]')
      if (block && form) {
        form.querySelector('[name="busyBlockId"]').value = block._id || ''
        form.querySelector('[name="title"]').value = block.title || ''
        form.querySelector('[name="reason"]').value = block.reason || ''
        form.querySelector('[name="note"]').value = block.note || ''
        form.querySelector('[name="startAt"]').value = toLocalInputValue(block.start_at)
        form.querySelector('[name="endAt"]').value = toLocalInputValue(block.end_at)
        form.querySelector('[name="enabled"]').checked = block.enabled !== false
      }
      return
    }

    if (action === 'reset-busy-form') {
      const form = document.querySelector('[data-form="busy-block"]')
      if (form) {
        form.reset()
        form.querySelector('[name="busyBlockId"]').value = ''
        form.querySelector('[name="enabled"]').checked = true
      }
      return
    }

    if (action === 'delete-busy') {
      if (!window.confirm('确认删除这个忙碌时段？')) {
        return
      }
      await withBusy('正在删除忙碌时段...', () => deleteBusyBlock(trigger.dataset.id))
      showToast('忙碌时段已删除')
      await loadSchedule(true)
      return
    }

    if (action === 'refresh-availability') {
      await withBusy('正在重算未来一周可预约时段...', () => refreshAvailability(7))
      showToast('未来一周可预约时段已刷新')
      await loadSchedule(true)
      return
    }

    if (action === 'select-plan') {
      state.plans.selectedId = trigger.dataset.id || ''
      render()
      await loadPlanDetail(state.plans.selectedId)
      return
    }

    if (action === 'new-plan') {
      state.plans.selectedId = ''
      state.plans.detail = null
      render()
      return
    }
  } catch (err) {
    showToast(err.message || '操作失败', 'error')
  }
}

async function handleSubmit(event) {
  const form = event.target.closest('form[data-form]')
  if (!form) {
    return
  }

  event.preventDefault()
  const formType = form.dataset.form

  try {
    if (formType === 'login') {
      await handleLogin(form)
      return
    }

    if (formType === 'bootstrap') {
      await handleBootstrap(form)
      return
    }

    if (formType === 'users-search') {
      await handleUsersSearch(form)
      return
    }

    if (formType === 'bookings-search') {
      await handleBookingsSearch(form)
      return
    }

    if (formType === 'plans-search') {
      await handlePlansSearch(form)
      return
    }

    if (formType === 'booking-status') {
      await handleBookingStatus(form, event.submitter)
      return
    }

    if (formType === 'template') {
      await handleTemplateSubmit(form)
      return
    }

    if (formType === 'busy-block') {
      await handleBusyBlockSubmit(form)
      return
    }

    if (formType === 'plan-editor') {
      await handlePlanEditorSubmit(form, event.submitter)
      return
    }

    if (formType === 'plan-report') {
      await handlePlanReportSubmit(form)
    }
  } catch (err) {
    showToast(err.message || '提交失败', 'error')
  }
}

window.addEventListener('hashchange', async () => {
  const nextPage = getPageFromHash()
  if (nextPage === state.page) {
    return
  }

  state.page = nextPage
  render()
  if (state.admin) {
    await loadPage(nextPage)
  }
})

document.addEventListener('click', (event) => {
  handleClick(event)
})

document.addEventListener('submit', (event) => {
  handleSubmit(event)
})

initializeApp()
