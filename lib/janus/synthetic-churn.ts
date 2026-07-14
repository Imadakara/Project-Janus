// Синтетический чурн Фазы 1: симуляция суток жизни долей сегмента — каждая живая доля
// умирает с вероятностью λ (дискретизация экспоненциальной модели концепта, раздел 4.2,
// достаточная для суточного шага дебаг-симуляции). rng инъецируется параметром ради
// детерминированных тестов; Math.random появляется только у вызывающего
// (app/api/debug/janus/tick-churn). В Фазе 2 заменяется фактическим heartbeat-чурном.

export function tickChurn(sharesAlive: number, lambdaPerDay: number, rng: () => number): number {
  let survivors = 0;
  for (let i = 0; i < sharesAlive; i += 1) {
    if (rng() >= lambdaPerDay) survivors += 1;
  }
  return survivors;
}
