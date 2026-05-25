export const formatTime = (date: string, isRelative: boolean) => {
  if (!date) return { date: 'N/A', time: '' }
  if (!isRelative) {
    return {
      date: new Date(date).toLocaleDateString([], {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
      }),
      time: new Date(date).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    }
  }

  const now = new Date()
  const then = new Date(date)
  const diff = now.getTime() - then.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return { date: `${days}d`, time: '' }
  if (hours > 0) return { date: `${hours}h`, time: '' }
  if (minutes > 0) return { date: `${minutes}m`, time: '' }
  return { date: 'now', time: '' }
}

export const formatPaymentMethod = (method: string): string => {
  const labels: Record<string, string> = {
    cash: 'Cash',
    upi: 'UPI',
    card: 'Card',
    other: 'Other',
  }
  return labels[method] || method
}
