export function buildUserDataUpsertRpcArgs(
  userId: string,
  data: Record<string, unknown>,
  expectedVersion: number,
) {
  return {
    p_user_id: userId,
    p_data: data,
    p_expected_version: expectedVersion,
  }
}

export function buildTimezoneInitializationRpcArgs(
  userId: string,
  timezone: string,
) {
  return {
    p_user_id: userId,
    p_timezone: timezone,
  }
}
