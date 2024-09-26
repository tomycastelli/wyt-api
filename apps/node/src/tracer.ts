import { init } from "dd-trace";

const tracer = init({
	logInjection: true,
	hostname: "dd-agent",
	plugins: false,
	appsec: false,
});

tracer.use("http", {
	blocklist: ["/health-check", "/"],
	splitByDomain: true,
	validateStatus: (code) => code < 400 || code === 422 || code === 409,
});

tracer.use("winston", {
	enabled: true,
});

export default tracer;
