const flightTime = tuning => (2 * Math.abs(tuning.jumpVelocity)) / tuning.gravity;
const slideCarry = tuning => {
  const delta = Math.max(0, tuning.maxSlideSpeed - tuning.maxRunSpeed);
  const decayTime = delta / tuning.airAcceleration;
  return delta * decayTime / 2;
};
const coyoteCarry = (tuning, horizontalSpeed) => {
  const runOff = horizontalSpeed * tuning.coyoteTime;
  const fallDistance = .5 * tuning.gravity * tuning.coyoteTime ** 2;
  const fallFlightExtension = fallDistance / Math.abs(tuning.jumpVelocity) * tuning.maxRunSpeed;
  return runOff + fallFlightExtension;
};

export function reachEnvelope(tuning) {
  const normal = tuning.maxRunSpeed * flightTime(tuning) + tuning.cornerCorrection;
  const slide = normal + slideCarry(tuning);
  const coyote = normal + coyoteCarry(tuning, tuning.maxRunSpeed);
  const limit = slide + coyoteCarry(tuning, tuning.maxSlideSpeed);
  return {
    normalGap: normal,
    slideGap: slide,
    coyoteGap: coyote,
    limitGap: limit,
    apexHeight: tuning.jumpVelocity ** 2 / (2 * tuning.gravity),
    practicalStep: Math.floor((tuning.jumpVelocity ** 2 / (2 * tuning.gravity)) / 14) * 14,
  };
}

export function landingWindow(tuning, stepHeight, mode = 'normal') {
  const envelope = reachEnvelope(tuning);
  const discriminant = Math.max(0, tuning.jumpVelocity ** 2 - 2 * tuning.gravity * Math.max(0, stepHeight));
  const root = Math.sqrt(discriminant);
  const velocity = Math.abs(tuning.jumpVelocity);
  const earliest = (velocity - root) / tuning.gravity * tuning.maxRunSpeed;
  const latestNormal = (velocity + root) / tuning.gravity * tuning.maxRunSpeed + tuning.cornerCorrection;
  const multiplier = mode === 'limit' && envelope.normalGap > 0 ? envelope.limitGap / envelope.normalGap : 1;
  return { minX: earliest * multiplier, maxX: latestNormal * multiplier };
}

export function classifyReach(tuning, gap, stepHeight) {
  const normal = landingWindow(tuning, stepHeight, 'normal');
  if (gap >= normal.minX && gap <= normal.maxX) return 'green';
  const limit = landingWindow(tuning, stepHeight, 'limit');
  if (gap >= limit.minX && gap <= limit.maxX) return 'yellow';
  return 'red';
}

export function jumpCurvePoint(tuning, x, mode = 'normal') {
  const speed = mode === 'limit' ? reachEnvelope(tuning).limitGap / flightTime(tuning) : tuning.maxRunSpeed;
  const time = x / speed;
  return Math.abs(tuning.jumpVelocity) * time - .5 * tuning.gravity * time ** 2;
}
