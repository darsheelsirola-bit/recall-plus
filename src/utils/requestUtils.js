export function generationSingleFlightKey(feature, payloadKey) {
  return `${String(feature)}:${String(payloadKey)}`
}

export function createSingleFlight() {
  const activeRequests = new Map()

  return function runSingleFlight(key, operation) {
    const active = activeRequests.get(key)
    if (active) return active

    const request = Promise.resolve()
      .then(operation)
      .finally(() => {
        if (activeRequests.get(key) === request) activeRequests.delete(key)
      })
    activeRequests.set(key, request)
    return request
  }
}
