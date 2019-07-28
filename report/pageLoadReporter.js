const fs = require("fs");
const diff = require("../utils/diff");
const Handlebars = require("handlebars");

Handlebars.registerHelper("limit", (e, max) => e && e.slice(0, max || 100));

Handlebars.registerHelper("tableRowClass", e => {
    return !e || Math.abs(e) < 5 ? "" : e < 0 ? "table-success " : "table-danger";
});

Handlebars.registerHelper("friendlyName", e =>
    e.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())
);

Handlebars.registerHelper("toPercentBadge", e => {
    const rounded = Math.round(e);
    const value = rounded > 0 ? "+" + rounded : rounded;
    let klass = "badge badge-primary";
    if (e < 0) klass = "badge badge-success";
    else if (e > 0) klass = "badge badge-danger";

    return `<span class="${klass}">${value}%</span>`;
});

const buildTemplate = name => {
    const src = fs.readFileSync(`report/templates/${name}`, "utf8");
    return Handlebars.compile(src);
};

const currentDateStr = () =>
    new Date()
        .toISOString()
        .replace(/:|-|T|\./g, "")
        .slice(0, 14);

function buildRequestTypeSummary(tracingData) {
    const breakdown = {};
    for (k in tracingData) {
        const val = tracingData[k];
        if (val.breakdown) {
            const largestEncoded = val.breakdown
                .sort((a, b) => b.encodedDataLength - a.encodedDataLength)
                .slice(0, 5)
                .map(e => ({ value: e.encodedDataLength, url: e.url, unit: "kb" }));
            const longestDuration = val.breakdown
                .sort((a, b) => b.duration - a.duration)
                .slice(0, 5)
                .map(e => ({ value: e.duration, url: e.url, unit: "ms" }));

            breakdown[k] = {
                largestEncoded,
                longestDuration
            };
        }
    }
    return breakdown;
}

function constructReportData(
    previousTiming,
    currentTiming,
    previousTracing,
    currentTracing
) {
    const timingDiff = diff.diffMetrics(previousTiming, currentTiming);
    const tracingDiff = diff.diffMetrics(previousTracing, currentTracing);

    const previousRequestTypeSummary = buildRequestTypeSummary(previousTracing);
    const currentRequestTypeSummary = buildRequestTypeSummary(currentTracing);

    // split between overview metrics and mime type specific
    const overview = Object.entries(tracingDiff)
        .filter(([_, v]) => v.hasOwnProperty("previous"))
        .map(([k, v]) => ({ metric: k, ...v }));

    const typeOverview = Object.entries(tracingDiff)
        .filter(([_, v]) => !v.hasOwnProperty("previous"))
        .map(([type, v]) => ({
            type,
            summary: Object.entries(v).map(e => ({ metric: e[0], ...e[1] })),
            breakdown: Object.entries(currentRequestTypeSummary[type]).map(
                ([metric, _]) => {
                    return {
                        metric,
                        previous: previousRequestTypeSummary[type][metric],
                        current: currentRequestTypeSummary[type][metric]
                    };
                }
            )
        }));

    return {
        timingDiff: Object.entries(timingDiff).map(e => ({ metric: e[0], ...e[1] })),
        tracingDiff: {
            overview,
            typeOverview
        }
    };
}

function generatePageLoadReport(previousRunData, currentRunData) {
    const res = constructReportData(
        diff.previousTimings,
        diff.currentTimings,
        diff.previousTracing,
        diff.currentTracing
    );
    const template = buildTemplate("pageLoadReportTemplate.html");
    const doc = template(res);
    fs.writeFileSync("generated/output.html", doc);
    console.log(JSON.stringify(res, null, 2));
}

generatePageLoadReport();