const { request } = require('../utils/request')

function callCloud(name, data = {}) {
  return wx.cloud.callFunction({ name, data }).then(res => res.result)
}

function login(profile = {}) {
  return callCloud('userLogin', { profile })
}

function getHomeData() {
  return callCloud('homeDashboard')
}

function getDevices(params) {
  return callCloud('deviceDirectorySearch', { action: 'list', ...params })
}

function getDeviceDetail(id) {
  return callCloud('deviceDirectorySearch', { action: 'detail', id })
}

function saveDevice(device) {
  return callCloud('deviceArchiveEdit', { action: device.id || device._id ? 'update' : 'create', device })
}

function deleteDevice(id) {
  return callCloud('deviceArchiveEdit', { action: 'delete', id })
}

function getWorkorders(params) {
  return callCloud('repairWorkOrder', { action: 'list', ...params })
}

function getWorkorderDetail(id) {
  return callCloud('repairWorkOrder', { action: 'detail', id })
}

function saveWorkorder(order) {
  return callCloud('repairWorkOrder', { action: order.id || order._id ? 'update' : 'create', order })
}

function dispatchWorkorder(id, assigneeOpenid) {
  return callCloud('repairWorkOrder', { action: 'dispatch', id, assigneeOpenid })
}

function startWorkorder(id) {
  return callCloud('repairWorkOrder', { action: 'start', id })
}

function completeWorkorder(id, trace) {
  return callCloud('repairWorkOrder', { action: 'complete', id, trace })
}

function deleteWorkorder(id) {
  return callCloud('repairWorkOrderDelete', { id })
}

function getAssignableUsers() {
  return callCloud('repairWorkOrder', { action: 'assignableUsers' })
}

function getMaintenanceRecords(params = {}) {
  return callCloud('maintenanceRecordEdit', { action: 'list', ...params })
}

function getMaintenanceRecord(id) {
  return callCloud('maintenanceRecordEdit', { action: 'detail', id })
}

function saveMaintenanceRecord(record) {
  return callCloud('maintenanceRecordEdit', { action: record.id || record._id ? 'update' : 'create', record })
}

function deleteMaintenanceRecord(id) {
  return callCloud('maintenanceRecordDelete', { id })
}

function getPermissionUsers() {
  return callCloud('userPermissionManage', { action: 'list' })
}

function savePermissionUser(user) {
  return callCloud('userPermissionManage', { action: 'upsert', user })
}

function removePermissionUser(openid) {
  return callCloud('userPermissionManage', { action: 'remove', openid })
}

function getEnergyReport() {
  return callCloud('energyAnalysis', { action: 'report' })
}

function getEnergyDevices() {
  return callCloud('energyAnalysis', { action: 'devices' })
}

function saveEnergyData(record) {
  return callCloud('energyAnalysis', { action: 'save', record })
}

function getEnergyTrend(params = {}) {
  return callCloud('energyAnalysis', { action: 'trend', ...params })
}

function calculateEnergy(params = {}) {
  return callCloud('energyAnalysis', { action: 'calculate', ...params })
}

function createEnergyReport(params = {}) {
  return callCloud('energyAnalysis', { action: 'createReport', ...params })
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
