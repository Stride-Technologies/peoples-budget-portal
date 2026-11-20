/**
 * Published-snapshot-shaped programs from the real 2027 AIP (budget data is
 * public record), with the variations the open-data mapper must handle added
 * by hand and **personal and internal fields salted** with SALT-* values and
 * salted.*@example.com addresses. The mapper spec fails if any salted key or
 * value reaches the CSV or JSON output.
 *
 * - programA: CAgO "Cost Reduction Interventions", nested PAs; a program-level
 *   climate tag with two CCET codes, a PA tag with none, one PA split by fund
 *   (GF + SHF) and one unsplit multi-fund PA (GF, SEF).
 * - programB: CHO "Diagnostic, Laboratory…", DIRECT_COSTS, no PAs, split GF + SHF.
 * - programC: programB as an old snapshot with no fundAllocations / tag keys.
 */
/* eslint-disable */
export const programASnapshot: Record<string, unknown> = {
  "id": "01a13a2c-bd17-7288-a299-23fc0d559aa3",
  "name": "Cost Reduction Interventions",
  "office": {
    "id": "01a13a2c-adb5-7309-a934-e36517a7973f",
    "name": "Office of the City Agriculturist",
    "vision": null,
    "acronym": "CAgO",
    "cluster": {
      "id": "01a13a2c-adab-72ce-8070-6a3a0d7968da",
      "name": "Economy",
      "fullName": "Thriving Economy",
      "createdAt": "2026-10-14T11:29:29.003Z",
      "updatedAt": "2026-10-14T11:29:29.003Z"
    },
    "mission": null,
    "isActive": true,
    "lguLevel": 2,
    "clusterId": "01a13a2c-adab-72ce-8070-6a3a0d7968da",
    "createdAt": "2026-10-14T11:29:29.013Z",
    "updatedAt": "2026-10-14T11:29:29.013Z",
    "canEndorse": false,
    "officeCode": "19",
    "officeType": "OPTIONAL",
    "papSectorId": "01a13a2c-ad51-77cf-bddf-1f0b5ac4774b",
    "aipSectorGroup": null,
    "mandateLegalBasis": null,
    "organizationalOutcomes": [],
    "contact": {
      "email": "salted.staff@example.com"
    }
  },
  "status": "DRAFT",
  "coTotal": "0",
  "psTotal": "0",
  "remarks": "SALT-REMARK",
  "costMode": "ACTIVITY_CHILDREN",
  "officeId": "01a13a2c-adb5-7309-a934-e36517a7973f",
  "papClass": "OPERATIONS",
  "createdAt": "2026-10-14T11:29:32.951Z",
  "deletedAt": null,
  "mooeTotal": "0",
  "papSector": {
    "id": "01a13a2c-ad51-77cf-bddf-1f0b5ac4774b",
    "code": "8000",
    "name": "Other Economic Services Sector",
    "isActive": true,
    "createdAt": "2026-10-14T11:29:28.913Z",
    "updatedAt": "2026-10-14T11:29:28.913Z",
    "annexSource": "BOM Annex 2",
    "subsectorCode": null
  },
  "sourceRef": "SALT-SOURCE-REF",
  "updatedAt": "2026-10-14T11:29:32.966Z",
  "aipCycleId": "01a13a2c-b303-7799-b531-c97f8439b8f1",
  "finishLine": {
    "id": "01a13a2c-ada6-712c-8e0a-96923df6fc4c",
    "name": "Naga as a Thriving & Inclusive Economy",
    "color": "#E5243B",
    "fullName": "Naga as a Thriving & Inclusive Economy",
    "createdAt": "2026-10-14T11:29:28.998Z",
    "shortName": "Thriving & Inclusive Economy",
    "updatedAt": "2026-10-14T11:29:28.998Z",
    "visionNumber": 1
  },
  "grandTotal": "0",
  "orderIndex": 13,
  "description": null,
  "fundSources": [
    "GF"
  ],
  "papSectorId": "01a13a2c-ad51-77cf-bddf-1f0b5ac4774b",
  "publishedAt": null,
  "finishLineId": "01a13a2c-ada6-712c-8e0a-96923df6fc4c",
  "hostOfficeId": null,
  "proposedTotal": "851000",
  "publishedName": null,
  "sglgIndicator": null,
  "currentVersion": 0,
  "expectedOutput": null,
  "importWarnings": [
    "SALT-IMPORT-WARNING"
  ],
  "coProposedTotal": "0",
  "createdByUserId": "SALT-USER-0001",
  "fundAllocations": [],
  "psProposedTotal": "0",
  "rejectionReason": "SALT-REJECTION",
  "sglgIndicatorId": null,
  "subFinishLineId": null,
  "aipReferenceCode": null,
  "climateChangeTag": {
    "id": "fixture-program-tag",
    "programId": "01a13a2c-bd17-7288-a299-23fc0d559aa3",
    "projectActivityId": null,
    "ccaAmount": "0",
    "ccmAmount": "851000",
    "remarks": "SALT-TAG-REMARK",
    "codes": [
      {
        "tagId": "fixture-program-tag",
        "ccetCodeId": "01a13a2c-ad88-733d-906b-5e7754777a13",
        "ccetCode": {
          "id": "01a13a2c-ad88-733d-906b-5e7754777a13",
          "code": "M114-01",
          "name": "Integrated organic and inorganic nutrient management",
          "pillar": "MITIGATION",
          "isActive": true,
          "createdAt": "2026-10-14T11:29:28.968Z",
          "updatedAt": "2026-10-14T11:29:28.968Z",
          "description": "Local CCET typology — CCC, \"Climate Budgeting for Local Government Training Manual\", p.18"
        }
      },
      {
        "tagId": "fixture-program-tag",
        "ccetCodeId": "01a13a2c-ad88-733d-906b-68f5c3322fa0",
        "ccetCode": {
          "id": "01a13a2c-ad88-733d-906b-68f5c3322fa0",
          "code": "M114-04",
          "name": "Manure management and methane capture in animal husbandry",
          "pillar": "MITIGATION",
          "isActive": true,
          "createdAt": "2026-10-14T11:29:28.968Z",
          "updatedAt": "2026-10-14T11:29:28.968Z",
          "description": "Local CCET typology — CCC, \"Climate Budgeting for Local Government Training Manual\", p.18"
        }
      }
    ]
  },
  "majorFinalOutput": null,
  "papSubsectorCode": "000",
  "sourceDocumentId": "SALT-SOURCE-DOC",
  "mooeProposedTotal": "851000",
  "projectActivities": [
    {
      "id": "01a13a2c-bd18-723c-a004-4bf70de6b79d",
      "name": "Balanced Fertilization Adoption Program",
      "type": "PROJECT",
      "coTotal": "0",
      "psTotal": "0",
      "remarks": "SALT-REMARK",
      "costMode": "ACTIVITY_CHILDREN",
      "createdAt": "2026-10-14T11:29:32.952Z",
      "lineItems": [
        {
          "id": "SALT-LINE-ID",
          "description": "SALT-LINE-ITEM",
          "unitCost": "987654.32",
          "createdByUserId": "SALT-USER-0003"
        }
      ],
      "mooeTotal": "0",
      "programId": "01a13a2c-bd17-7288-a299-23fc0d559aa3",
      "sourceRef": "SALT-SOURCE-REF",
      "updatedAt": "2026-10-14T11:29:32.962Z",
      "coEstimate": null,
      "grandTotal": "0",
      "orderIndex": 0,
      "psEstimate": null,
      "description": null,
      "fundSources": [
        "GF"
      ],
      "mooeEstimate": "130000",
      "expectedOutput": null,
      "proposedBudget": "130000",
      "createdByUserId": "SALT-USER-0001",
      "fundAllocations": [],
      "aipReferenceCode": null,
      "climateChangeTag": {
        "id": "fixture-codeless-tag",
        "programId": null,
        "projectActivityId": "01a13a2c-bd18-723c-a004-4bf70de6b79d",
        "ccaAmount": "130000",
        "ccmAmount": "0",
        "remarks": "SALT-TAG-REMARK",
        "codes": []
      },
      "majorFinalOutput": null,
      "sourceDocumentId": "SALT-SOURCE-DOC",
      "targetForBudgetYear": null,
      "implementationEndYear": 2027,
      "implementationEndMonth": 12,
      "implementationStartYear": 2027,
      "parentProjectActivityId": null,
      "implementationStartMonth": 1,
      "tentativeAipReferenceCode": "8000-2-02-19-003-006-001"
    },
    {
      "id": "01a13a2c-bd18-723c-a004-4e28ec4ebe51",
      "name": "Training and Adoption of BFS Protocols",
      "type": "ACTIVITY",
      "coTotal": "0",
      "psTotal": "0",
      "remarks": "SALT-REMARK",
      "costMode": "DIRECT_COSTS",
      "createdAt": "2026-10-14T11:29:32.952Z",
      "lineItems": [
        {
          "id": "SALT-LINE-ID",
          "description": "SALT-LINE-ITEM",
          "unitCost": "987654.32",
          "createdByUserId": "SALT-USER-0003"
        }
      ],
      "mooeTotal": "0",
      "programId": "01a13a2c-bd17-7288-a299-23fc0d559aa3",
      "sourceRef": "SALT-SOURCE-REF",
      "updatedAt": "2026-10-14T11:29:32.961Z",
      "coEstimate": null,
      "grandTotal": "0",
      "orderIndex": 0,
      "psEstimate": null,
      "description": null,
      "fundSources": [
        "GF"
      ],
      "mooeEstimate": "100000",
      "expectedOutput": "50 farmers are practicing BFS",
      "proposedBudget": "100000",
      "createdByUserId": "SALT-USER-0001",
      "fundAllocations": [],
      "aipReferenceCode": null,
      "climateChangeTag": {
        "id": "01a13a2c-bd18-723c-a004-53252ed5e7b7",
        "codes": [
          {
            "tagId": "01a13a2c-bd18-723c-a004-53252ed5e7b7",
            "ccetCode": {
              "id": "01a13a2c-ad88-733d-906b-5e7754777a13",
              "code": "M114-01",
              "name": "Integrated organic and inorganic nutrient management",
              "pillar": "MITIGATION",
              "isActive": true,
              "createdAt": "2026-10-14T11:29:28.968Z",
              "updatedAt": "2026-10-14T11:29:28.968Z",
              "description": "Local CCET typology — CCC, \"Climate Budgeting for Local Government Training Manual\", p.18"
            },
            "ccetCodeId": "01a13a2c-ad88-733d-906b-5e7754777a13"
          }
        ],
        "remarks": "SALT-TAG-REMARK",
        "ccaAmount": "0",
        "ccmAmount": "100000",
        "createdAt": "2026-10-14T11:29:32.952Z",
        "programId": null,
        "updatedAt": "2026-10-14T11:29:32.952Z",
        "projectActivityId": "01a13a2c-bd18-723c-a004-4e28ec4ebe51"
      },
      "majorFinalOutput": null,
      "sourceDocumentId": "SALT-SOURCE-DOC",
      "targetForBudgetYear": null,
      "implementationEndYear": 2027,
      "implementationEndMonth": 12,
      "implementationStartYear": 2027,
      "parentProjectActivityId": "01a13a2c-bd18-723c-a004-4bf70de6b79d",
      "implementationStartMonth": 1,
      "tentativeAipReferenceCode": "8000-2-02-19-003-006-001-01"
    },
    {
      "id": "01a13a2c-bd1a-7739-aa80-5cd013846030",
      "name": "Conversion of Nursery into demo site for natural/organic farming practices",
      "type": "ACTIVITY",
      "coTotal": "0",
      "psTotal": "0",
      "remarks": "SALT-REMARK",
      "costMode": "DIRECT_COSTS",
      "createdAt": "2026-10-14T11:29:32.954Z",
      "lineItems": [
        {
          "id": "SALT-LINE-ID",
          "description": "SALT-LINE-ITEM",
          "unitCost": "987654.32",
          "createdByUserId": "SALT-USER-0003"
        }
      ],
      "mooeTotal": "0",
      "programId": "01a13a2c-bd17-7288-a299-23fc0d559aa3",
      "sourceRef": "SALT-SOURCE-REF",
      "updatedAt": "2026-10-14T11:29:32.963Z",
      "coEstimate": null,
      "grandTotal": "0",
      "orderIndex": 0,
      "psEstimate": null,
      "description": null,
      "fundSources": [
        "GF",
        "SHF"
      ],
      "mooeEstimate": "601000",
      "expectedOutput": "100% of farm inputs used at the city nursery are organic",
      "proposedBudget": "601000",
      "createdByUserId": "SALT-USER-0001",
      "fundAllocations": [
        {
          "id": "fixture-fa-1",
          "programId": null,
          "projectActivityId": "01a13a2c-bd1a-7739-aa80-5cd013846030",
          "fundSource": "GF",
          "ps": "0",
          "mooe": "500000",
          "co": "0",
          "orderIndex": 0
        },
        {
          "id": "fixture-fa-2",
          "programId": null,
          "projectActivityId": "01a13a2c-bd1a-7739-aa80-5cd013846030",
          "fundSource": "SHF",
          "ps": "0",
          "mooe": "101000",
          "co": "0",
          "orderIndex": 1
        }
      ],
      "aipReferenceCode": null,
      "climateChangeTag": {
        "id": "01a13a2c-bd1b-7504-a231-d3be48dbe18f",
        "codes": [
          {
            "tagId": "01a13a2c-bd1b-7504-a231-d3be48dbe18f",
            "ccetCode": {
              "id": "01a13a2c-ad88-733d-906b-68f5c3322fa0",
              "code": "M114-04",
              "name": "Manure management and methane capture in animal husbandry",
              "pillar": "MITIGATION",
              "isActive": true,
              "createdAt": "2026-10-14T11:29:28.968Z",
              "updatedAt": "2026-10-14T11:29:28.968Z",
              "description": "Local CCET typology — CCC, \"Climate Budgeting for Local Government Training Manual\", p.18"
            },
            "ccetCodeId": "01a13a2c-ad88-733d-906b-68f5c3322fa0"
          },
          {
            "tagId": "01a13a2c-bd1b-7504-a231-d3be48dbe18f",
            "ccetCode": {
              "id": "01a13a2c-ad88-733d-906b-5e7754777a13",
              "code": "M114-01",
              "name": "Integrated organic and inorganic nutrient management",
              "pillar": "MITIGATION",
              "isActive": true,
              "createdAt": "2026-10-14T11:29:28.968Z",
              "updatedAt": "2026-10-14T11:29:28.968Z",
              "description": "Local CCET typology — CCC, \"Climate Budgeting for Local Government Training Manual\", p.18"
            },
            "ccetCodeId": "01a13a2c-ad88-733d-906b-5e7754777a13"
          }
        ],
        "remarks": "SALT-TAG-REMARK",
        "ccaAmount": "0",
        "ccmAmount": "1061000",
        "createdAt": "2026-10-14T11:29:32.955Z",
        "programId": null,
        "updatedAt": "2026-10-14T11:29:32.955Z",
        "projectActivityId": "01a13a2c-bd1a-7739-aa80-5cd013846030"
      },
      "majorFinalOutput": null,
      "sourceDocumentId": "SALT-SOURCE-DOC",
      "targetForBudgetYear": null,
      "implementationEndYear": 2027,
      "implementationEndMonth": 12,
      "implementationStartYear": 2027,
      "parentProjectActivityId": "01a13a2c-bd19-775f-bdeb-44b9893d149c",
      "implementationStartMonth": 1,
      "tentativeAipReferenceCode": "8000-2-02-19-003-006-002-01"
    },
    {
      "id": "01a13a2c-bd19-775f-bdeb-3dc31bf7fc4e",
      "name": "Soil analysis and fertilizer recommendation services",
      "type": "ACTIVITY",
      "coTotal": "0",
      "psTotal": "0",
      "remarks": "SALT-REMARK",
      "costMode": "DIRECT_COSTS",
      "createdAt": "2026-10-14T11:29:32.953Z",
      "lineItems": [
        {
          "id": "SALT-LINE-ID",
          "description": "SALT-LINE-ITEM",
          "unitCost": "987654.32",
          "createdByUserId": "SALT-USER-0003"
        }
      ],
      "mooeTotal": "0",
      "programId": "01a13a2c-bd17-7288-a299-23fc0d559aa3",
      "sourceRef": "SALT-SOURCE-REF",
      "updatedAt": "2026-10-14T11:29:32.962Z",
      "coEstimate": null,
      "grandTotal": "0",
      "orderIndex": 1,
      "psEstimate": null,
      "description": null,
      "fundSources": [
        "GF"
      ],
      "mooeEstimate": "30000",
      "expectedOutput": "100 has analyzed and fertilizer recommendation received by farmers",
      "proposedBudget": "30000",
      "createdByUserId": "SALT-USER-0001",
      "fundAllocations": [],
      "aipReferenceCode": null,
      "climateChangeTag": {
        "id": "01a13a2c-bd19-775f-bdeb-43521777c483",
        "codes": [
          {
            "tagId": "01a13a2c-bd19-775f-bdeb-43521777c483",
            "ccetCode": {
              "id": "01a13a2c-ad88-733d-906b-5e7754777a13",
              "code": "M114-01",
              "name": "Integrated organic and inorganic nutrient management",
              "pillar": "MITIGATION",
              "isActive": true,
              "createdAt": "2026-10-14T11:29:28.968Z",
              "updatedAt": "2026-10-14T11:29:28.968Z",
              "description": "Local CCET typology — CCC, \"Climate Budgeting for Local Government Training Manual\", p.18"
            },
            "ccetCodeId": "01a13a2c-ad88-733d-906b-5e7754777a13"
          }
        ],
        "remarks": "SALT-TAG-REMARK",
        "ccaAmount": "0",
        "ccmAmount": "30000",
        "createdAt": "2026-10-14T11:29:32.953Z",
        "programId": null,
        "updatedAt": "2026-10-14T11:29:32.953Z",
        "projectActivityId": "01a13a2c-bd19-775f-bdeb-3dc31bf7fc4e"
      },
      "majorFinalOutput": null,
      "sourceDocumentId": "SALT-SOURCE-DOC",
      "targetForBudgetYear": null,
      "implementationEndYear": 2027,
      "implementationEndMonth": 12,
      "implementationStartYear": 2027,
      "parentProjectActivityId": "01a13a2c-bd18-723c-a004-4bf70de6b79d",
      "implementationStartMonth": 1,
      "tentativeAipReferenceCode": "8000-2-02-19-003-006-001-02"
    },
    {
      "id": "01a13a2c-bd19-775f-bdeb-44b9893d149c",
      "name": "Natural/Organic Farming Promotion Project",
      "type": "PROJECT",
      "coTotal": "0",
      "psTotal": "0",
      "remarks": "SALT-REMARK",
      "costMode": "ACTIVITY_CHILDREN",
      "createdAt": "2026-10-14T11:29:32.953Z",
      "lineItems": [
        {
          "id": "SALT-LINE-ID",
          "description": "SALT-LINE-ITEM",
          "unitCost": "987654.32",
          "createdByUserId": "SALT-USER-0003"
        }
      ],
      "mooeTotal": "0",
      "programId": "01a13a2c-bd17-7288-a299-23fc0d559aa3",
      "sourceRef": "SALT-SOURCE-REF",
      "updatedAt": "2026-10-14T11:29:32.965Z",
      "coEstimate": null,
      "grandTotal": "0",
      "orderIndex": 1,
      "psEstimate": null,
      "description": null,
      "fundSources": [
        "GF"
      ],
      "mooeEstimate": "721000",
      "expectedOutput": null,
      "proposedBudget": "721000",
      "createdByUserId": "SALT-USER-0001",
      "fundAllocations": [],
      "aipReferenceCode": null,
      "climateChangeTag": null,
      "majorFinalOutput": null,
      "sourceDocumentId": "SALT-SOURCE-DOC",
      "targetForBudgetYear": null,
      "implementationEndYear": 2027,
      "implementationEndMonth": 12,
      "implementationStartYear": 2027,
      "parentProjectActivityId": null,
      "implementationStartMonth": 1,
      "tentativeAipReferenceCode": "8000-2-02-19-003-006-002"
    },
    {
      "id": "01a13a2c-bd1b-7504-a231-d45bc369fec4",
      "name": "Vermicast Production",
      "type": "ACTIVITY",
      "coTotal": "0",
      "psTotal": "0",
      "remarks": "SALT-REMARK",
      "costMode": "DIRECT_COSTS",
      "createdAt": "2026-10-14T11:29:32.955Z",
      "lineItems": [
        {
          "id": "SALT-LINE-ID",
          "description": "SALT-LINE-ITEM",
          "unitCost": "987654.32",
          "createdByUserId": "SALT-USER-0003"
        }
      ],
      "mooeTotal": "0",
      "programId": "01a13a2c-bd17-7288-a299-23fc0d559aa3",
      "sourceRef": "SALT-SOURCE-REF",
      "updatedAt": "2026-10-14T11:29:32.965Z",
      "coEstimate": null,
      "grandTotal": "0",
      "orderIndex": 1,
      "psEstimate": null,
      "description": null,
      "fundSources": [
        "GF",
        "SEF"
      ],
      "mooeEstimate": "120000",
      "expectedOutput": "2 tons of vermicast produced; 4 vermi beds",
      "proposedBudget": "120000",
      "createdByUserId": "SALT-USER-0001",
      "fundAllocations": [],
      "aipReferenceCode": null,
      "climateChangeTag": {
        "id": "01a13a2c-bd1c-741d-a53b-b843e00f631b",
        "codes": [
          {
            "tagId": "01a13a2c-bd1c-741d-a53b-b843e00f631b",
            "ccetCode": {
              "id": "01a13a2c-ad88-733d-906b-5e7754777a13",
              "code": "M114-01",
              "name": "Integrated organic and inorganic nutrient management",
              "pillar": "MITIGATION",
              "isActive": true,
              "createdAt": "2026-10-14T11:29:28.968Z",
              "updatedAt": "2026-10-14T11:29:28.968Z",
              "description": "Local CCET typology — CCC, \"Climate Budgeting for Local Government Training Manual\", p.18"
            },
            "ccetCodeId": "01a13a2c-ad88-733d-906b-5e7754777a13"
          }
        ],
        "remarks": "SALT-TAG-REMARK",
        "ccaAmount": "0",
        "ccmAmount": "100000",
        "createdAt": "2026-10-14T11:29:32.956Z",
        "programId": null,
        "updatedAt": "2026-10-14T11:29:32.956Z",
        "projectActivityId": "01a13a2c-bd1b-7504-a231-d45bc369fec4"
      },
      "majorFinalOutput": null,
      "sourceDocumentId": "SALT-SOURCE-DOC",
      "targetForBudgetYear": null,
      "implementationEndYear": 2027,
      "implementationEndMonth": 12,
      "implementationStartYear": 2027,
      "parentProjectActivityId": "01a13a2c-bd19-775f-bdeb-44b9893d149c",
      "implementationStartMonth": 1,
      "tentativeAipReferenceCode": "8000-2-02-19-003-006-002-02"
    }
  ],
  "publishedByUserId": "SALT-USER-0002",
  "publishedVersionId": null,
  "targetForBudgetYear": null,
  "implementationEndYear": 2027,
  "implementationEndMonth": 12,
  "publishedProposedTotal": null,
  "implementationStartYear": 2027,
  "implementationStartMonth": 1,
  "tentativeAipReferenceCode": "8000-2-02-19-003-006-000",
  "comments": [
    {
      "body": "SALT-COMMENT",
      "authorEmail": "salted.commenter@example.com"
    }
  ],
  "feedback": [
    {
      "name": "SALT-FEEDBACK-NAME",
      "email": "salted.citizen@example.com"
    }
  ]
};

export const programALive = {
  "publishedName": "Cost Reduction Interventions",
  "publishedProposedTotal": "851000",
  "psProposedTotal": "0",
  "mooeProposedTotal": "851000",
  "coProposedTotal": "0",
  "psTotal": "0",
  "mooeTotal": "0",
  "coTotal": "0",
  "publishedAt": "2026-10-14T11:30:00.000Z",
  "version": 1,
  "office": {
    "id": "01a13a2c-adb5-7309-a934-e36517a7973f",
    "name": "Office of the City Agriculturist",
    "vision": null,
    "acronym": "CAgO",
    "cluster": {
      "id": "01a13a2c-adab-72ce-8070-6a3a0d7968da",
      "name": "Economy",
      "fullName": "Thriving Economy",
      "createdAt": "2026-10-14T11:29:29.003Z",
      "updatedAt": "2026-10-14T11:29:29.003Z"
    },
    "mission": null,
    "isActive": true,
    "lguLevel": 2,
    "clusterId": "01a13a2c-adab-72ce-8070-6a3a0d7968da",
    "createdAt": "2026-10-14T11:29:29.013Z",
    "updatedAt": "2026-10-14T11:29:29.013Z",
    "canEndorse": false,
    "officeCode": "19",
    "officeType": "OPTIONAL",
    "papSectorId": "01a13a2c-ad51-77cf-bddf-1f0b5ac4774b",
    "aipSectorGroup": null,
    "mandateLegalBasis": null,
    "organizationalOutcomes": [],
    "contact": {
      "email": "salted.staff@example.com"
    }
  },
  "finishLine": {
    "id": "01a13a2c-ada6-712c-8e0a-96923df6fc4c",
    "name": "Naga as a Thriving & Inclusive Economy",
    "color": "#E5243B",
    "fullName": "Naga as a Thriving & Inclusive Economy",
    "createdAt": "2026-10-14T11:29:28.998Z",
    "shortName": "Thriving & Inclusive Economy",
    "updatedAt": "2026-10-14T11:29:28.998Z",
    "visionNumber": 1
  },
  "papSector": {
    "id": "01a13a2c-ad51-77cf-bddf-1f0b5ac4774b",
    "code": "8000",
    "name": "Other Economic Services Sector",
    "isActive": true,
    "createdAt": "2026-10-14T11:29:28.913Z",
    "updatedAt": "2026-10-14T11:29:28.913Z",
    "annexSource": "BOM Annex 2",
    "subsectorCode": null
  }
};

export const programBSnapshot: Record<string, unknown> = {
  "id": "01a13a2c-c15f-770e-8b18-0a0fe128996c",
  "name": "Diagnostic, Laboratory, Radiology, and Heart Station Services",
  "office": {
    "id": "01a13a2c-adbd-70b8-bf30-0056c165b62d",
    "name": "Naga City General Hospital",
    "vision": null,
    "acronym": "NCGH",
    "cluster": {
      "id": "01a13a2c-adad-75ec-8f43-f41ab0ec8504",
      "name": "Health",
      "fullName": "Healthy Nagueños",
      "createdAt": "2026-10-14T11:29:29.005Z",
      "updatedAt": "2026-10-14T11:29:29.005Z"
    },
    "mission": null,
    "isActive": true,
    "lguLevel": 2,
    "clusterId": "01a13a2c-adad-75ec-8f43-f41ab0ec8504",
    "createdAt": "2026-10-14T11:29:29.021Z",
    "updatedAt": "2026-10-14T11:29:29.021Z",
    "canEndorse": false,
    "officeCode": "42",
    "officeType": "OTHERS",
    "papSectorId": "01a13a2c-ad51-77cf-bddf-1f0b5ac4774b",
    "aipSectorGroup": "SOCIAL",
    "mandateLegalBasis": null,
    "organizationalOutcomes": [],
    "contact": {
      "email": "salted.staff@example.com"
    }
  },
  "status": "DRAFT",
  "coTotal": "0",
  "psTotal": "0",
  "remarks": "SALT-REMARK",
  "costMode": "DIRECT_COSTS",
  "officeId": "01a13a2c-adbd-70b8-bf30-0056c165b62d",
  "papClass": "OPERATIONS",
  "createdAt": "2026-10-14T11:29:34.047Z",
  "deletedAt": null,
  "mooeTotal": "0",
  "papSector": {
    "id": "01a13a2c-ad51-77cf-bddf-1f0b5ac4774b",
    "code": "8000",
    "name": "Other Economic Services Sector",
    "isActive": true,
    "createdAt": "2026-10-14T11:29:28.913Z",
    "updatedAt": "2026-10-14T11:29:28.913Z",
    "annexSource": "BOM Annex 2",
    "subsectorCode": null
  },
  "sourceRef": "SALT-SOURCE-REF",
  "updatedAt": "2026-10-14T11:29:34.049Z",
  "aipCycleId": "01a13a2c-b303-7799-b531-c97f8439b8f1",
  "finishLine": {
    "id": "01a13a2c-ada7-750f-bffe-b2a7f6afd075",
    "name": "Healthy and Educated Nagueños with Decent Homes",
    "color": "#26BDE2",
    "fullName": "Healthy and Educated Nagueños with Decent Homes",
    "createdAt": "2026-10-14T11:29:28.999Z",
    "shortName": "Health, Education, and Decent Homes",
    "updatedAt": "2026-10-14T11:29:28.999Z",
    "visionNumber": 4
  },
  "grandTotal": "0",
  "orderIndex": 9,
  "description": null,
  "fundSources": [
    "GF",
    "SHF"
  ],
  "papSectorId": "01a13a2c-ad51-77cf-bddf-1f0b5ac4774b",
  "publishedAt": null,
  "finishLineId": "01a13a2c-ada7-750f-bffe-b2a7f6afd075",
  "hostOfficeId": null,
  "proposedTotal": "26200000",
  "publishedName": null,
  "sglgIndicator": null,
  "currentVersion": 0,
  "expectedOutput": "Accurate, timely, and quality-assured clinical laboratory diagnostic procedures, diagnostic imaging (radiology), and non-invasive cardiovascular testing services delivered to support inpatient, outpatient, and emergency clinical decision-making while ensuring strict compliance with safety protocols and licensing standards.",
  "importWarnings": [
    "SALT-IMPORT-WARNING"
  ],
  "coProposedTotal": "0",
  "createdByUserId": "SALT-USER-0001",
  "fundAllocations": [
    {
      "co": "0",
      "id": "01a13a2c-c15f-770e-8b18-0c877d54b401",
      "ps": "0",
      "mooe": "16200000",
      "programId": "01a13a2c-c15f-770e-8b18-0a0fe128996c",
      "fundSource": "GF",
      "orderIndex": 0,
      "projectActivityId": null
    },
    {
      "co": "0",
      "id": "01a13a2c-c15f-770e-8b18-1120043d4ba3",
      "ps": "0",
      "mooe": "10000000",
      "programId": "01a13a2c-c15f-770e-8b18-0a0fe128996c",
      "fundSource": "SHF",
      "orderIndex": 1,
      "projectActivityId": null
    }
  ],
  "psProposedTotal": "0",
  "rejectionReason": "SALT-REJECTION",
  "sglgIndicatorId": null,
  "subFinishLineId": null,
  "aipReferenceCode": null,
  "climateChangeTag": null,
  "majorFinalOutput": null,
  "papSubsectorCode": "000",
  "sourceDocumentId": "SALT-SOURCE-DOC",
  "mooeProposedTotal": "26200000",
  "projectActivities": [],
  "publishedByUserId": "SALT-USER-0002",
  "publishedVersionId": null,
  "targetForBudgetYear": null,
  "implementationEndYear": 2027,
  "implementationEndMonth": 12,
  "publishedProposedTotal": null,
  "implementationStartYear": 2027,
  "implementationStartMonth": 1,
  "tentativeAipReferenceCode": "8000-2-03-42-003-001-000",
  "comments": [
    {
      "body": "SALT-COMMENT",
      "authorEmail": "salted.commenter@example.com"
    }
  ],
  "feedback": [
    {
      "name": "SALT-FEEDBACK-NAME",
      "email": "salted.citizen@example.com"
    }
  ]
};

export const programBLive = {
  "publishedName": "Diagnostic, Laboratory, Radiology, and Heart Station Services",
  "publishedProposedTotal": "26200000",
  "psProposedTotal": "0",
  "mooeProposedTotal": "26200000",
  "coProposedTotal": "0",
  "psTotal": "0",
  "mooeTotal": "0",
  "coTotal": "0",
  "publishedAt": "2026-10-14T11:30:00.000Z",
  "version": 1,
  "office": {
    "id": "01a13a2c-adbd-70b8-bf30-0056c165b62d",
    "name": "Naga City General Hospital",
    "vision": null,
    "acronym": "NCGH",
    "cluster": {
      "id": "01a13a2c-adad-75ec-8f43-f41ab0ec8504",
      "name": "Health",
      "fullName": "Healthy Nagueños",
      "createdAt": "2026-10-14T11:29:29.005Z",
      "updatedAt": "2026-10-14T11:29:29.005Z"
    },
    "mission": null,
    "isActive": true,
    "lguLevel": 2,
    "clusterId": "01a13a2c-adad-75ec-8f43-f41ab0ec8504",
    "createdAt": "2026-10-14T11:29:29.021Z",
    "updatedAt": "2026-10-14T11:29:29.021Z",
    "canEndorse": false,
    "officeCode": "42",
    "officeType": "OTHERS",
    "papSectorId": "01a13a2c-ad51-77cf-bddf-1f0b5ac4774b",
    "aipSectorGroup": "SOCIAL",
    "mandateLegalBasis": null,
    "organizationalOutcomes": [],
    "contact": {
      "email": "salted.staff@example.com"
    }
  },
  "finishLine": {
    "id": "01a13a2c-ada7-750f-bffe-b2a7f6afd075",
    "name": "Healthy and Educated Nagueños with Decent Homes",
    "color": "#26BDE2",
    "fullName": "Healthy and Educated Nagueños with Decent Homes",
    "createdAt": "2026-10-14T11:29:28.999Z",
    "shortName": "Health, Education, and Decent Homes",
    "updatedAt": "2026-10-14T11:29:28.999Z",
    "visionNumber": 4
  },
  "papSector": {
    "id": "01a13a2c-ad51-77cf-bddf-1f0b5ac4774b",
    "code": "8000",
    "name": "Other Economic Services Sector",
    "isActive": true,
    "createdAt": "2026-10-14T11:29:28.913Z",
    "updatedAt": "2026-10-14T11:29:28.913Z",
    "annexSource": "BOM Annex 2",
    "subsectorCode": null
  }
};

export const programCSnapshot: Record<string, unknown> = {
  "id": "01a13a2c-0000-7000-8000-00000000c0de",
  "name": "Diagnostic, Laboratory, Radiology, and Heart Station Services",
  "office": {
    "id": "01a13a2c-adbd-70b8-bf30-0056c165b62d",
    "name": "Naga City General Hospital",
    "vision": null,
    "acronym": "NCGH",
    "cluster": {
      "id": "01a13a2c-adad-75ec-8f43-f41ab0ec8504",
      "name": "Health",
      "fullName": "Healthy Nagueños",
      "createdAt": "2026-10-14T11:29:29.005Z",
      "updatedAt": "2026-10-14T11:29:29.005Z"
    },
    "mission": null,
    "isActive": true,
    "lguLevel": 2,
    "clusterId": "01a13a2c-adad-75ec-8f43-f41ab0ec8504",
    "createdAt": "2026-10-14T11:29:29.021Z",
    "updatedAt": "2026-10-14T11:29:29.021Z",
    "canEndorse": false,
    "officeCode": "42",
    "officeType": "OTHERS",
    "papSectorId": "01a13a2c-ad51-77cf-bddf-1f0b5ac4774b",
    "aipSectorGroup": "SOCIAL",
    "mandateLegalBasis": null,
    "organizationalOutcomes": [],
    "contact": {
      "email": "salted.staff@example.com"
    }
  },
  "status": "DRAFT",
  "coTotal": "0",
  "psTotal": "0",
  "remarks": "SALT-REMARK",
  "costMode": "DIRECT_COSTS",
  "officeId": "01a13a2c-adbd-70b8-bf30-0056c165b62d",
  "papClass": "OPERATIONS",
  "createdAt": "2026-10-14T11:29:34.047Z",
  "deletedAt": null,
  "mooeTotal": "0",
  "papSector": {
    "id": "01a13a2c-ad51-77cf-bddf-1f0b5ac4774b",
    "code": "8000",
    "name": "Other Economic Services Sector",
    "isActive": true,
    "createdAt": "2026-10-14T11:29:28.913Z",
    "updatedAt": "2026-10-14T11:29:28.913Z",
    "annexSource": "BOM Annex 2",
    "subsectorCode": null
  },
  "sourceRef": "SALT-SOURCE-REF",
  "updatedAt": "2026-10-14T11:29:34.049Z",
  "aipCycleId": "01a13a2c-b303-7799-b531-c97f8439b8f1",
  "finishLine": {
    "id": "01a13a2c-ada7-750f-bffe-b2a7f6afd075",
    "name": "Healthy and Educated Nagueños with Decent Homes",
    "color": "#26BDE2",
    "fullName": "Healthy and Educated Nagueños with Decent Homes",
    "createdAt": "2026-10-14T11:29:28.999Z",
    "shortName": "Health, Education, and Decent Homes",
    "updatedAt": "2026-10-14T11:29:28.999Z",
    "visionNumber": 4
  },
  "grandTotal": "0",
  "orderIndex": 9,
  "description": null,
  "fundSources": [
    "GF",
    "SHF"
  ],
  "papSectorId": "01a13a2c-ad51-77cf-bddf-1f0b5ac4774b",
  "publishedAt": null,
  "finishLineId": "01a13a2c-ada7-750f-bffe-b2a7f6afd075",
  "hostOfficeId": null,
  "proposedTotal": "26200000",
  "publishedName": null,
  "sglgIndicator": null,
  "currentVersion": 0,
  "expectedOutput": "Accurate, timely, and quality-assured clinical laboratory diagnostic procedures, diagnostic imaging (radiology), and non-invasive cardiovascular testing services delivered to support inpatient, outpatient, and emergency clinical decision-making while ensuring strict compliance with safety protocols and licensing standards.",
  "importWarnings": [
    "SALT-IMPORT-WARNING"
  ],
  "coProposedTotal": "0",
  "createdByUserId": "SALT-USER-0001",
  "psProposedTotal": "0",
  "rejectionReason": "SALT-REJECTION",
  "sglgIndicatorId": null,
  "subFinishLineId": null,
  "aipReferenceCode": null,
  "majorFinalOutput": null,
  "papSubsectorCode": "000",
  "sourceDocumentId": "SALT-SOURCE-DOC",
  "mooeProposedTotal": "26200000",
  "projectActivities": [],
  "publishedByUserId": "SALT-USER-0002",
  "publishedVersionId": null,
  "targetForBudgetYear": null,
  "implementationEndYear": 2027,
  "implementationEndMonth": 12,
  "publishedProposedTotal": null,
  "implementationStartYear": 2027,
  "implementationStartMonth": 1,
  "tentativeAipReferenceCode": "8000-2-03-42-003-001-000",
  "comments": [
    {
      "body": "SALT-COMMENT",
      "authorEmail": "salted.commenter@example.com"
    }
  ],
  "feedback": [
    {
      "name": "SALT-FEEDBACK-NAME",
      "email": "salted.citizen@example.com"
    }
  ]
};

export const programCLive = {
  "publishedName": "Diagnostic, Laboratory, Radiology, and Heart Station Services",
  "publishedProposedTotal": "26200000",
  "psProposedTotal": "0",
  "mooeProposedTotal": "26200000",
  "coProposedTotal": "0",
  "psTotal": "0",
  "mooeTotal": "0",
  "coTotal": "0",
  "publishedAt": "2026-10-14T11:30:00.000Z",
  "version": 1,
  "office": {
    "id": "01a13a2c-adbd-70b8-bf30-0056c165b62d",
    "name": "Naga City General Hospital",
    "vision": null,
    "acronym": "NCGH",
    "cluster": {
      "id": "01a13a2c-adad-75ec-8f43-f41ab0ec8504",
      "name": "Health",
      "fullName": "Healthy Nagueños",
      "createdAt": "2026-10-14T11:29:29.005Z",
      "updatedAt": "2026-10-14T11:29:29.005Z"
    },
    "mission": null,
    "isActive": true,
    "lguLevel": 2,
    "clusterId": "01a13a2c-adad-75ec-8f43-f41ab0ec8504",
    "createdAt": "2026-10-14T11:29:29.021Z",
    "updatedAt": "2026-10-14T11:29:29.021Z",
    "canEndorse": false,
    "officeCode": "42",
    "officeType": "OTHERS",
    "papSectorId": "01a13a2c-ad51-77cf-bddf-1f0b5ac4774b",
    "aipSectorGroup": "SOCIAL",
    "mandateLegalBasis": null,
    "organizationalOutcomes": [],
    "contact": {
      "email": "salted.staff@example.com"
    }
  },
  "finishLine": {
    "id": "01a13a2c-ada7-750f-bffe-b2a7f6afd075",
    "name": "Healthy and Educated Nagueños with Decent Homes",
    "color": "#26BDE2",
    "fullName": "Healthy and Educated Nagueños with Decent Homes",
    "createdAt": "2026-10-14T11:29:28.999Z",
    "shortName": "Health, Education, and Decent Homes",
    "updatedAt": "2026-10-14T11:29:28.999Z",
    "visionNumber": 4
  },
  "papSector": {
    "id": "01a13a2c-ad51-77cf-bddf-1f0b5ac4774b",
    "code": "8000",
    "name": "Other Economic Services Sector",
    "isActive": true,
    "createdAt": "2026-10-14T11:29:28.913Z",
    "updatedAt": "2026-10-14T11:29:28.913Z",
    "annexSource": "BOM Annex 2",
    "subsectorCode": null
  }
};

export const SALTED_VALUES = [
  'SALT-', 'salted.', '@example.com', '987654.32',
];
export const SALTED_KEYS = [
  'createdByUserId', 'publishedByUserId', 'sourceRef', 'sourceDocumentId',
  'remarks', 'rejectionReason', 'email', 'lineItems', 'comments', 'feedback',
  'importWarnings', 'authorEmail',
];
