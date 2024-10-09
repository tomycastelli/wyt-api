export class RateLimiter {
  private max_calls: number;
  private period: number;
  private calls: number;
  private start_time: number;

  constructor(max_calls: number, period: number) {
    this.max_calls = max_calls;
    this.period = period;
    this.calls = 0;
    this.start_time = Date.now();
  }

  public acquire(): Promise<void> {
    return new Promise((resolve) => {
      const current_time = Date.now();
      const elapsed_time = (current_time - this.start_time) / 1000;

      if (elapsed_time > this.period) {
        this.calls = 0;
        this.start_time = current_time;
      }

      if (this.calls < this.max_calls) {
        this.calls += 1;
        resolve();
      } else {
        const sleep_time =
          this.period * 1000 - (current_time - this.start_time);
        setTimeout(() => {
          this.calls = 1;
          this.start_time = Date.now();
          resolve();
        }, sleep_time);
      }
    });
  }
}
