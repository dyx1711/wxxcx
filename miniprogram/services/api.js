const { request } = require('../utils/request')

const memoryCache = {}
const pendingRequests = {}

function cacheKey(name, data = {}) {
  return `${name}:${JSON.stringify(data)}`
}

function callCloud(name, data = {}) {
  return wx.cloud.callFunction({ name, data }).then(res => res.result)
}

function callCloudCached(name, data = {}, maxAge = 20000) {
  const key = cacheKey(name, data)
  const now = Date.now()
  const cached = memoryCache[key]
  if (cached && now - cached.time < maxAge) {
    return Promise.resolve(cached.result)
  }
  if (pendingRequests[key]) {
    return pendingRequests[key]
  }
  pendingRequests[key] = callCloud(name, data)
    .then(result => {
      memoryCache[key] = { time: Date.now(), result }
      return result
    })
    .finally(() => {
      delete pendingRequests[key]
    })
  return pendingRequests[key]
}

function clearReadCache() {
  Object.keys(memoryCache).forEach(key => {
    delete memoryCache[key]
  })
}

function mutateCloud(name, data = {}) {
  return callCloud(name, data).then(result => {
    clearReadCache()
    return result
  })
}

function login(profile = {}) {
  return mutateCloud('userLogin', { profile })
}

function getHomeData() {
  return callCloudCached('homeDashboard', {}, 15000)
}

function getDevices(params) {
  return callCloudCached('deviceDirectorySearch', { action: 'list', ...params }, 20000)
}

function getDeviceDetail(id) {
  return callCloudCached('deviceDirectorySearch', { action: 'detail', id }, 45000)
}

function saveDevice(device) {
  return mutateCloud('deviceArchiveEdit', { action: device.id || device._id ? 'update' : 'create', device })
}

function deleteDevice(id) {
  return mutateCloud('deviceArchiveEdit', { action: 'delete', id })
}

function getWorkorders(params) {
  return callCloudCached('repairWorkOrder', { action: 'list', ...params }, 15000)
}

function getWorkorderDetail(id) {
  return callCloudCached('repairWorkOrder', { action: 'detail', id }, 30000)
}

function saveWorkorder(order) {
  return mutateCloud('repairWorkOrder', { action: order.id || order._id ? 'update' : 'create', order })
}

function dispatchWorkorder(id, assigneeOpenid) {
  return mutateCloud('repairWorkOrder', { action: 'dispatch', id, assigneeOpenid })
}

function startWorkorder(id) {
  return mutateCloud('repairWorkOrder', { action: 'start', id })
}

function completeWorkorder(id, trace) {
  return mutateCloud('repairWorkOrder', { action: 'complete', id, trace })
}

function deleteWorkorder(id) {
  return mutateCloud('repairWorkOrderDelete', { id })
}

function getAssignableUsers() {
  return callCloudCached('repairWorkOrder', { action: 'assignableUsers' }, 30000)
}

function getMaintenanceRecords(params = {}) {
  return callCloudCached('maintenanceRecordEdit', { action: 'list', ...params }, 20000)
}

function getMaintenanceRecord(id) {
  return callCloudCached('maintenanceRecordEdit', { action: 'detail', id }, 30000)
}

function saveMaintenanceRecord(record) {
  return mutateCloud('maintenanceRecordEdit', { action: record.id || record._id ? 'update' : 'create', record })
}

function deleteMaintenanceRecord(id) {
  return mutateCloud('maintenanceRecordDelete', { id })
}

function getPermissionUsers() {
  return callCloudCached('userPermissionManage', { action: 'list' }, 30000)
}

function savePermissionUser(user) {
  return mutateCloud('userPermissionManage', { action: 'upsert', user })
}

function removePermissionUser(openid) {
  return mutateCloud('userPermissionManage', { action: 'remove', openid })
}

function getEnergyReport() {
  return callCloudCached('energyAnalysis', { action: 'report' }, 20000)
}

function getEnergyDevices() {
  return callCloudCached('energyAnalysis', { action: 'devices' }, 30000)
}

function saveEnergyData(record) {
  return mutateCloud('energyAnalysis', { action: 'save', record })
}

function getEnergyTrend(params = {}) {
  return callCloudCached('energyAnalysis', { action: 'trend', ...params }, 20000)
}

function calculateEnergy(params = {}) {
  return callCloudCached('energyAnalysis', { action: 'calculate', ...params }, 20000)
}

function createEnergyReport(params = {}) {
  return callCloudCached('energyAnalysis', { action: 'createReport', ...params }, 20000)
}

function generateDeviceQrCode(id, envVersion = 'release') {
  return callCloud('deviceQrCode', { id, envVersion })
}

module.exports = {
  login,
  getHomeData,
  getDevices,
  getDeviceDetail,
  saveDevice,
  deleteDevice,
  getWorkorders,
  getWorkorderDetail,
  saveWorkorder,
  dispatchWorkorder,
  startWorkorder,
  completeWorkorder,
  deleteWorkorder,
  getAssignableUsers,
  getMaintenanceRecords,
  getMaintenanceRecord,
  saveMaintenanceRecord,
  deleteMaintenanceRecord,
  getEnergyReport,
  getEnergyDevices,
  saveEnergyData,
  getEnergyTrend,
  calculateEnergy,
  createEnergyReport,
  generateDeviceQrCode,
  getPermissionUsers,
  savePermissionUser,
  removePermissionUser
}
