// goal_id only means something on spending (withdrawal) or transfer (contribution); earning + goal is rejected.
export function goalAllowed(type: string): boolean {
  return type === "spending" || type === "transfer";
}
