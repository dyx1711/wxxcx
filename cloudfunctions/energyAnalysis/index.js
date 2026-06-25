const cloud = require('wx-server-sdk')

cloud.init({ env: 'dyx0214-d4gg0btzz41aeafe8' })

const db = cloud.database()
const _ = db.command
const ENERGY = 'energy_records'
const DEVICES = 'devices'
const USERS = 'users'

function ok(data) {
  return { code: 0, data }
}

function fail(code, message) {
  return { code, message }
}

async function getUser(openid) {
  const res = await db.collection(USERS).where({ openid, status: 'active' }).limit(1).get()
  return res.data[0]
}

function canView(user) {
  return user && (user.role === 'admin' || user.permissions && user.permissions.canView)
}

function canEdit(user) {
  return user && user.role === 'admin'
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function monthKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

function weekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${pad(week)}`
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function addMonths(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function normalizePeriodKey(periodType, value) {
  const date = value ? new Date(value) : new Date()
  if (periodType === 'week') return /^\d{4}-W\d{2}$/.test(value || '') ? value : weekKey(date)
  if (periodType === 'month') return /^\d{4}-\d{2}$/.test(value || '') ? value : monthKey(date)
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : formatDate(date)
}

function periodLabel(periodType, key) {
  if (periodType === 'week') return key.replace('-W', ' W')
  if (periodType === 'month') return key
  return key.slice(5)
}

function compareKey(key, start, end) {
  if (start && key < start) return false
  if (end && key > end) return false
  return true
}

function normalizeRecord(item) {
  return {
    ...item,
    id: item._id,
    value: Number(item.energy || 0)
  }
}

function buildDeviceLookup(devices = []) {
  return devices.reduce((acc, device) => {
    acc.byId[device._id] = device
    if (device.name) acc.byName[device.name] = device
    return acc
  }, { byId: {}, byName: {} })
}

async function getActiveDeviceLookup(filterDeviceId = '') {
  if (filterDeviceId) {
    const deviceRes = await db.collection(DEVICES).doc(filterDeviceId).get().catch(() => null)
    if (!deviceRes || !deviceRes.data || deviceRes.data.deleted) {
      return buildDeviceLookup([])
    }
    return buildDeviceLookup([deviceRes.data])
  }

  const devicesRes = await db.collection(DEVICES).where({ deleted: _.neq(true) }).field({
    _id: true,
    name: true
  }).limit(1000).get().catch(() => ({ data: [] }))
  return buildDeviceLookup(devicesRes.data)
}

function attachActiveDevice(record, lookup) {
  const device = record.deviceId
    ? lookup.byId[record.deviceId]
    : record.deviceName && lookup.byName[record.deviceName]

  if (!device) return null

  return {
    ...record,
    deviceId: record.deviceId || device._id,
    deviceName: device.name || record.deviceName
  }
}

async function fetchEnergyRecords(filter = {}) {
  const query = { deleted: _.neq(true) }
  if (filter.deviceId) query.deviceId = filter.deviceId
  if (filter.periodType) query.periodType = filter.periodType
  const [lookup, res] = await Promise.all([
    getActiveDeviceLookup(filter.deviceId || ''),
    db.collection(ENERGY).where(query).orderBy('periodKey', 'desc').limit(1000).get()
  ])
  return res.data
    .map(record => attachActiveDevice(record, lookup))
    .filter(Boolean)
    .map(normalizeRecord)
}

function buildTrend(records, periodType, startKey, endKey) {
  const bucket = {}
  records.forEach(item => {
    if (item.periodType !== periodType) return
    if (!compareKey(item.periodKey, startKey, endKey)) return
    bucket[item.periodKey] = (bucket[item.periodKey] || 0) + Number(item.energy || 0)
  })
  return Object.keys(bucket).sort().map(key => ({
    key,
    label: periodLabel(periodType, key),
    value: Number(bucket[key].toFixed(2))
  }))
}

function recentKeys(periodType) {
  const now = new Date()
  if (periodType === 'month') {
    return Array.from({ length: 6 }, (_, i) => monthKey(addMonths(now, i - 5)))
  }
  if (periodType === 'week') {
    return Array.from({ length: 8 }, (_, i) => weekKey(addDays(now, (i - 7) * 7)))
  }
  return Array.from({ length: 7 }, (_, i) => formatDate(addDays(now, i - 6)))
}

function buildRecentTrend(records, periodType) {
  const keys = recentKeys(periodType)
  const bucket = {}
  records.forEach(item => {
    if (item.periodType !== periodType) return
    bucket[item.periodKey] = (bucket[item.periodKey] || 0) + Number(item.energy || 0)
  })
  const values = keys.map(key => Number((bucket[key] || 0).toFixed(2)))
  const max = Math.max(...values, 1)
  return {
    total: Number(values.reduce((sum, value) => sum + value, 0).toFixed(2)),
    unit: 'kWh',
    data: keys.map((key, index) => ({
      key,
      label: periodLabel(periodType, key),
      value: Math.round(values[index] / max * 100),
      rawValue: values[index]
    }))
  }
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]))
}

function buildReportHtml({ rows, summary }) {
  const rowHtml = rows.map(row => (
    '<tr>' +
    `<td>${escapeHtml(row.deviceName)}</td>` +
    `<td>${escapeHtml(row.periodType)}</td>` +
    `<td>${escapeHtml(row.periodKey)}</td>` +
    `<td>${Number(row.energy || 0).toFixed(2)}</td>` +
    `<td>${escapeHtml(row.unit || 'kWh')}</td>` +
    `<td>${escapeHtml(row.remark || '')}</td>` +
    '</tr>'
  )).join('')
  return `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
<h2>Device Energy Analysis Report</h2>
<p>Total: ${Number(summary.total || 0).toFixed(2)} kWh; Records: ${summary.count}</p>
<table border="1">
<thead><tr><th>Device</th><th>Period</th><th>Time</th><th>Energy</th><th>Unit</th><th>Remark</th></tr></thead>
<tbody>${rowHtml}</tbody>
</table>
</body>
</html>`
}

async function getFilteredRows(event) {
  const periodType = ['day', 'week', 'month'].includes(event.periodType) ? event.periodType : ''
  const records = await fetchEnergyRecords({ deviceId: event.deviceId, periodType })
  return records
    .filter(item => !event.startKey || compareKey(item.periodKey, event.startKey, event.endKey))
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey))
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const user = await getUser(OPENID)
  const action = event.action || 'report'

  if (!canView(user)) return fail(403, 'No permission to view energy data')

  if (action === 'devices') {
    const res = await db.collection(DEVICES).where({ deleted: _.neq(true) }).orderBy('updatedAt', 'desc').limit(200).get()
    return ok({
      list: res.data.map(item => ({
        id: item._id,
        name: item.name,
        model: item.model || '',
        location: item.location || ''
      }))
    })
  }

  if (action === 'save') {
    if (!canEdit(user)) return fail(403, 'No permission to upload energy data')
    const input = event.record || {}
    const periodType = ['day', 'week', 'month'].includes(input.periodType) ? input.periodType : 'day'
    const periodKey = normalizePeriodKey(periodType, input.periodKey || input.date)
    const energy = Number(input.energy)
    if (!input.deviceId || !input.deviceName) return fail(400, 'Device is required')
    if (!Number.isFinite(energy) || energy < 0) return fail(400, 'Invalid energy value')

    const deviceRes = await db.collection(DEVICES).doc(input.deviceId).get().catch(() => null)
    if (!deviceRes || !deviceRes.data || deviceRes.data.deleted) {
      return fail(404, 'Device does not exist or has been deleted')
    }

    const data = {
      deviceId: input.deviceId,
      deviceName: deviceRes.data.name || input.deviceName,
      periodType,
      periodKey,
      energy,
      unit: input.unit || 'kWh',
      remark: String(input.remark || '').trim(),
      deleted: false,
      updatedAt: db.serverDate(),
      updatedBy: OPENID
    }
    const old = await db.collection(ENERGY).where({
      deviceId: data.deviceId,
      periodType: data.periodType,
      periodKey: data.periodKey,
      deleted: _.neq(true)
    }).limit(1).get()
    if (old.data.length) {
      await db.collection(ENERGY).doc(old.data[0]._id).update({ data })
      return ok({ id: old.data[0]._id, mode: 'update' })
    }
    const addRes = await db.collection(ENERGY).add({
      data: {
        ...data,
        createdAt: db.serverDate(),
        createdBy: OPENID
      }
    })
    return ok({ id: addRes._id, mode: 'create' })
  }

  if (action === 'trend') {
    const periodType = ['day', 'week', 'month'].includes(event.periodType) ? event.periodType : 'day'
    const records = await fetchEnergyRecords({ deviceId: event.deviceId, periodType })
    const trend = buildTrend(records, periodType, event.startKey || '', event.endKey || '')
    const total = trend.reduce((sum, item) => sum + item.value, 0)
    return ok({
      list: records.filter(item => !event.startKey || compareKey(item.periodKey, event.startKey, event.endKey)).slice(0, 100),
      trend,
      total: Number(total.toFixed(2)),
      cumulative: Number(records.reduce((sum, item) => sum + Number(item.energy || 0), 0).toFixed(2)),
      unit: 'kWh'
    })
  }

  if (action === 'calculate') {
    const periodType = ['day', 'week', 'month'].includes(event.periodType) ? event.periodType : 'day'
    const records = await fetchEnergyRecords({ deviceId: event.deviceId, periodType })
    const list = records.filter(item => compareKey(item.periodKey, event.startKey, event.endKey))
    const total = list.reduce((sum, item) => sum + Number(item.energy || 0), 0)
    return ok({
      total: Number(total.toFixed(2)),
      count: list.length,
      unit: 'kWh',
      startKey: event.startKey || '',
      endKey: event.endKey || ''
    })
  }

  if (action === 'homeTrend') {
    const records = await fetchEnergyRecords()
    return ok({
      energyDay: buildRecentTrend(records, 'day'),
      energyWeek: buildRecentTrend(records, 'week'),
      energyMonth: buildRecentTrend(records, 'month')
    })
  }

  if (action === 'report' || action === 'createReport') {
    const rows = await getFilteredRows(event)
    const total = rows.reduce((sum, item) => sum + Number(item.energy || 0), 0)
    const byDevice = rows.reduce((acc, item) => {
      acc[item.deviceName] = (acc[item.deviceName] || 0) + Number(item.energy || 0)
      return acc
    }, {})
    const topDevices = Object.keys(byDevice)
      .map(name => ({ name, value: Number(byDevice[name].toFixed(2)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
    const summary = { total: Number(total.toFixed(2)), count: rows.length }
    const data = {
      month: monthKey(new Date()),
      total: summary.total,
      unit: 'kWh',
      compareLastMonth: 0,
      topDevices,
      rows: rows.slice(0, 100),
      summary
    }
    if (action === 'report') return ok(data)

    const html = buildReportHtml({ rows, summary })
    const cloudPath = `energy-reports/${Date.now()}-${Math.random().toString(16).slice(2)}.xls`
    const uploadRes = await cloud.uploadFile({
      cloudPath,
      fileContent: Buffer.from(html, 'utf8')
    })
    return ok({
      ...data,
      fileID: uploadRes.fileID,
      fileName: 'energy-analysis-report.xls',
      previewHtml: html
    })
  }

  return fail(400, 'Unsupported action')
}
