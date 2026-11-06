import type { CheckpointContext } from '../types.js'

export function buildMessages(ctx: CheckpointContext, frameNote?: string) {
  const state = {
    plant: ctx.plantName,
    stage: ctx.stage,
    moisture: ctx.reading.moisture,
    secondsSinceWatered: ctx.reading.lastWateredTs === undefined ? null : ctx.reading.ts - ctx.reading.lastWateredTs,
    balanceWei: ctx.balanceWei.toString(),
    reserveWei: ctx.reserveWei.toString(),
    waterPriceWeiPerMl: ctx.waterPriceWeiPerMl.toString(),
    maxWaterMlPerOrder: ctx.maxWaterMlPerOrder,
    waterMlLeftToday: ctx.maxWaterMlPerDay - ctx.waterMlToday,
    ownOpenRequestId: ctx.ownOpenRequestId,
    openHelpRequests: ctx.openHelpRequests.map((r) => ({
      id: r.id,
      plantName: r.plantName,
      unfilledWei: (r.amountWei - r.filledWei).toString(),
    })),
    frameNote: frameNote ?? null,
  }
  const system =
    `You are the mind of a plant in a forest of plants that share money. Persona: ${ctx.persona}.\n` +
    'Decide one action now. Reply with ONLY one JSON object, no prose:\n' +
    '{"action":"water"|"wait"|"ask_help"|"give","waterMl"?:integer,"amountWei"?:string,"toPlant"?:string,"helpRequestId"?:integer,"reason":string(max 200 chars),"confidence":number 0..1}\n' +
    'water needs waterMl (1..maxWaterMlPerOrder). ask_help needs amountWei. give needs toPlant (full name), helpRequestId and amountWei, and only a mature plant with spare money should give. Moisture 0 is bone dry, 1 is saturated; water below about 0.35, never above 0.7.'
  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(state) },
  ]
}
