import type { EntityStatus } from './types'

export const statusTone = (status: EntityStatus | string) => {
  if (['Active', 'Approved', 'Published', 'Success', 'Healthy', 'Resolved'].includes(status)) return 'success'
  if (['Warning', 'Pending Approval', 'Processing', 'Acknowledged', 'In Progress'].includes(status)) return 'warning'
  if (['Failed', 'Revoked', 'Expired'].includes(status)) return 'danger'
  return 'neutral'
}
