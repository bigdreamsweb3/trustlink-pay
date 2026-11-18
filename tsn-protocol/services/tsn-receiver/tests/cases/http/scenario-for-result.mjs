export function scenarioForResult(fixtures,result){
  for(const scenario of fixtures.cases)if(scenario.name===result.scenario)return scenario;
  const primary=result.route.includes("internal/node")?"requireService":result.route.includes("cranker")?"authenticateCrankerRequest":result.route.includes("health")?"storageGet":result.route.includes("work-status")?"getWork":"receive";
  if(result.scenario.startsWith("error-"))return {name:result.scenario,errors:{[primary]:result.scenario.slice(6)}};
  if(result.scenario==="health-code")return {name:result.scenario,errors:{storageGet:{message:"SYNTHETIC_HEALTH_ERROR",code:"SYNTHETIC_STORAGE_CODE"}}};
  if(result.scenario==="transition-expired")return {name:result.scenario,errors:{transition:"LEASE_INVALID"}};
  throw new Error("HTTP_BASELINE_SCENARIO_MISSING");
}
