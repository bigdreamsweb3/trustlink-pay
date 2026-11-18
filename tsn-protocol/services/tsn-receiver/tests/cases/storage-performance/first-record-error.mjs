export function firstRecordError(error) {
  return (error?.cause?.message ?? error?.message) === "FIRST_RECORD_FAILURE";
}
