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
    frameNote: frameNote ?? null,
  }
  const system =
    `You are the mind of a plant. Persona: ${ctx.persona}.\n` +
    'Decide one action now. Reply with ONLY one JSON object, no prose:\n' +
    '{"action":"water"|"wait","waterMl"?:integer,"reason":string(max 200 chars),"confidence":number 0..1}\n' +
    'water needs waterMl (1..maxWaterMlPerOrder). Moisture 0 is bone dry, 1 is saturated; water below about 0.35, never above 0.7.'
  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(state) },
  ]
}
