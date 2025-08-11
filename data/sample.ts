    export type TrendPoint = {
      date: string; // ISO date
      ptc: number; // cents/kWh
      bestFixed: number; // cents/kWh
      medianFixed: number; // cents/kWh
    };

    export const sampleTrends: Record<string, TrendPoint[]> = {
      "aep-ohio:elec:res:term12": [
  {
    "date": "2025-05-26",
    "ptc": 11.356,
    "bestFixed": 9.915,
    "medianFixed": 11.888
  },
  {
    "date": "2025-06-02",
    "ptc": 11.189,
    "bestFixed": 10.372,
    "medianFixed": 12.108
  },
  {
    "date": "2025-06-09",
    "ptc": 11.457,
    "bestFixed": 10.012,
    "medianFixed": 12.001
  },
  {
    "date": "2025-06-16",
    "ptc": 11.112,
    "bestFixed": 10.121,
    "medianFixed": 12.063
  },
  {
    "date": "2025-06-23",
    "ptc": 11.111,
    "bestFixed": 10.139,
    "medianFixed": 12.155
  },
  {
    "date": "2025-06-30",
    "ptc": 11.318,
    "bestFixed": 10.182,
    "medianFixed": 12.145
  },
  {
    "date": "2025-07-07",
    "ptc": 11.424,
    "bestFixed": 10.084,
    "medianFixed": 12.273
  },
  {
    "date": "2025-07-14",
    "ptc": 11.379,
    "bestFixed": 10.314,
    "medianFixed": 11.968
  },
  {
    "date": "2025-07-21",
    "ptc": 11.483,
    "bestFixed": 10.342,
    "medianFixed": 11.956
  },
  {
    "date": "2025-07-28",
    "ptc": 11.139,
    "bestFixed": 10.678,
    "medianFixed": 12.232
  },
  {
    "date": "2025-08-04",
    "ptc": 11.423,
    "bestFixed": 10.638,
    "medianFixed": 12.218
  },
  {
    "date": "2025-08-11",
    "ptc": 11.489,
    "bestFixed": 10.457,
    "medianFixed": 12.246
  }
]
    };

    export const summary = {
      updatedAt: "2025-08-11",
      utilities: [
        {
          utility: "aep-ohio",
          commodity: "electric",
          customerClass: "residential",
          bestFixedCentsPerKwh: 10.457,
          medianFixedCentsPerKwh: 12.246,
          ptcCentsPerKwh: 11.489,
          daysSinceLastChange: 3
        }
      ]
    };
