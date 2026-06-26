const cloud = require('wx-server-sdk')

cloud.init({ env: 'dyx0214-d4gg0btzz41aeafe8' })

const db = cloud.database()
const USERS = 'users'
const CONFIG = 'app_config'
const SUBSCRIBE_CONFIG_ID = 'subscribeMessage'

const DEFAULT_FIELD_MAPS = {
  workorderAssigned: {
    deviceName: 'thing1',
    title: 'thing2',
    location: 'thing3',
    time: 'time4',
    status: 'phrase5'
  },
  maintenanceCreated: {
    deviceName: 'thing1',
    title: 'thing2',
    dueDate: 'date3',
    status: 'phrase4'
  }
}

function ok(data) {
  return { code: 0, data }
}

function fail(code, message, data) {
  return { code, message, data }
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatNow() {
  const date = new Date()
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function getUser(openid) {
  const res = await db.collection(USERS).where({ openid, status: 'active' }).limit(1).get()
  return res.data[0]
}

function canView(user) {
  return user && (user.role === 'admin' || user.permissions && user.permissions.canView)
}

async function getSubscribeConfig() {
  const envConfig = {
    workorderAssignedTemplateId: process.env.WORKORDER_ASSIGNED_TEMPLATE_ID || '',
    maintenanceCreatedTemplateId: process.env.MAINTENANCE_CREATED_TEMPLATE_ID || '',
    miniprogramState: process.env.WECHAT_MINIPROGRAM_STATE || 'formal',
    fieldMaps: DEFAULT_FIELD_MAPS
  }

  const res = await db.collection(CONFIG).doc(SUBSCRIBE_CONFIG_ID).get().catch(() => null)
  const data = res && res.data || {}
  return {
    workorderAssignedTemplateId: data.workorderAssignedTemplateId || envConfig.workorderAssignedTemplateId,
    maintenanceCreatedTemplateId: data.maintenanceCreatedTemplateId || envConfig.maintenanceCreatedTemplateId,
    miniprogramState: data.miniprogramState || envConfig.miniprogramState,
    fieldMaps: {
      workorderAssigned: {
        ...DEFAULT_FIELD_MAPS.workorderAssigned,
        ...(data.fieldMaps && data.fieldMaps.workorderAssigned)
      },
      maintenanceCreated: {
        ...DEFAULT_FIELD_MAPS.maintenanceCreated,
        ...(data.fieldMaps && data.fieldMaps.maintenanceCreated)
      }
    }
  }
}

function buildTemplateMeta(config) {
  return {
    workorderAssigned: {
      name: '派工提醒',
      templateId: config.workorderAssignedTemplateId || '',
      configured: !!config.workorderAssignedTemplateId
    },
    maintenanceCreated: {
      name: '保养提醒',
      templateId: config.maintenanceCreatedTemplateId || '',
      configured: !!config.maintenanceCreatedTemplateId
    }
  }
}

function normalizePreferences(user = {}, config = {}) {
  const saved = user.subscribeMessages || {}
  const templates = buildTemplateMeta(config)
  return {
    enabled: !!saved.enabled,
    workorderAssigned: !!saved.workorderAssigned && templates.workorderAssigned.configured,
    maintenanceCreated: !!saved.maintenanceCreated && templates.maintenanceCreated.configured,
    updatedAtText: saved.updatedAtText || '',
    lastResult: saved.lastResult || {}
  }
}

function isAccepted(result = {}, templateId = '') {
  return !!templateId && result[templateId] === 'accept'
}

function isSubscribeType(type) {
  return type === 'workorderAssigned' || type === 'maintenanceCreated'
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const action = event.action || 'status'
  const user = await getUser(OPENID)
  if (!canView(user)) return fail(403, '无消息提醒权限')

  const config = await getSubscribeConfig()
  const templates = buildTemplateMeta(config)
  const configured = templates.workorderAssigned.configured || templates.maintenanceCreated.configured

  if (action === 'status' || action === 'config') {
    return ok({
      configured,
      templates,
      preferences: normalizePreferences(user, config),
      miniprogramState: config.miniprogramState,
      fieldMaps: config.fieldMaps
    })
  }

  if (action === 'save') {
    const result = event.result || event.results || {}
    const type = event.type || ''
    if (!configured) return fail(400, '订阅消息模板尚未配置')

    const savedPreferences = normalizePreferences(user, config)
    const workorderAssigned = isSubscribeType(type) && type !== 'workorderAssigned'
      ? savedPreferences.workorderAssigned
      : isAccepted(result, templates.workorderAssigned.templateId)
    const maintenanceCreated = isSubscribeType(type) && type !== 'maintenanceCreated'
      ? savedPreferences.maintenanceCreated
      : isAccepted(result, templates.maintenanceCreated.templateId)
    const updatedAtText = formatNow()
    const preferences = {
      enabled: workorderAssigned || maintenanceCreated,
      workorderAssigned,
      maintenanceCreated,
      updatedAtText,
      lastResult: result
    }

    await db.collection(USERS).doc(user._id).update({
      data: {
        subscribeMessages: {
          ...preferences,
          updatedAt: db.serverDate()
        },
        updatedAt: db.serverDate()
      }
    })

    return ok({
      configured,
      templates,
      preferences
    })
  }

  return fail(400, '不支持的操作')
}
