import { Route } from '../structures'
import { toArray } from '../utils'
import { BetaAnalyticsDataClient } from "@google-analytics/data"

import key from '../keys/adrian-salvador-website-9e67e3e8a223.json' assert { type: 'json' }

export default class Analytics extends Route {
  constructor() {
    super({
      position: 2,
      path: '/analytics'
    });
  }

  routes(app, options, done) {
    app.get('/', async (req, res) => {
      const analyticsData = new BetaAnalyticsDataClient({
        credentials: {
          client_email: key.client_email,
          private_key: key.private_key
        }
      })

      const reports = {
        basic: () => {
          return {
            property: 'properties/325424669',
            dateRanges: [
              {
                startDate: '7daysAgo',
                endDate: 'today'
              }
            ],
            metrics: [
              {
                name: 'screenPageViews'
              },
              {
                name: 'totalUsers'
              },
              {
                name: 'newUsers'
              },
              {
                name: 'engagementRate'
              }
            ]
          }
        },
        popular: () => {
          return {
            property: 'properties/325424669',
            dateRanges: [
              {
                startDate: "30daysAgo",
                endDate: "today",
              },
            ],
            dimensions: [
              {
                name: "pagePath",
              },
              {
                name: "pageTitle",
              },
            ],
            metrics: [
              {
                name: "screenPageViews",
              },
            ],
            orderBys: [
              {
                metric: {
                  metricName: "screenPageViews"
                },
                desc: true
              }
            ]
          }
        },
        trending: () => {
          return {
            property: 'properties/325424669',
            dateRanges: [
              {
                startDate: "1daysAgo",
                endDate: "today"
              }
            ],
            dimensions: [
              {
                name: "pagePath"
              },
              {
                name: "pageTitle",
              },
            ],
            metrics: [
              {
                name: "screenPageViews"
              }
            ],
            orderBys: [
              {
                metric: {
                  metricName: "screenPageViews"
                },
                desc: true
              }
            ]
          }
        }
      }

      const summary = {}

      for (const [alias, report] of Object.entries(reports)) {
        const reportQuery = report()
        const response = await analyticsData.runReport(reportQuery)
          .then((value) => {
            return value[0]
          })
          .catch((err) => {
            console.error(err)
          })

        let results = {}

        if (response && response.rows) {
          for (const row of response.rows) {
            let pagePath = ""
            let removals = []

            if (row && row.dimensionValues && row.dimensionValues.length > 0 && row.metricValues) {
              const item = {}
              for (let idx = 0; idx < row.dimensionValues.length; idx++) {
                const dimensionKey = <string>reportQuery.dimensions[idx].name
                let dimensionValue = <string>row.dimensionValues[idx].value

                for (const toReplace of removals) {
                  dimensionValue = dimensionValue.replace(toReplace, "")
                }

                if (dimensionKey === "pagePath") {
                  if (dimensionValue !== "/") {
                    dimensionValue = dimensionValue.replace(/\/$/, "")
                  }
                  pagePath = dimensionValue
                } else {
                  item[dimensionKey] = dimensionValue
                }
              }

              for (let idx = 0; idx < row.metricValues.length; idx++) {
                const metricKey = <string>reportQuery.metrics[idx].name
                const metricValue = <string>row.metricValues[idx].value
                item[metricKey] = metricValue
              }

              results[pagePath] = item
            }
          }

          if (alias === 'basic') {
            results = {
              pageViews: response.rows[0].metricValues[0].value,
              totalVisitors: response.rows[0].metricValues[1].value,
              newVisitors: response.rows[0].metricValues[2].value,
              engagementRate: response.rows[0].metricValues[3].value,
            }
          }
        }

        summary[alias] = results
      }

      summary.popular = toArray(summary.popular)
      summary.trending = toArray(summary.trending)

      console.log(summary)

      return summary

    })

    done()
  }
}
