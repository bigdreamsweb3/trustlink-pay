export function failMutation(error, data) {
  data["scheduler-state"].row.version = 99;
  throw error;
}
