import type { Catalogue } from './catalogue.service.js';

const value = (id: string) => ({
  id,
  label: id,
  dbIds: [`db-${id}`],
  aliases: {},
});

export const CAT: Catalogue = {
  version: 'test',
  documents: [
    {
      kind: 'aip',
      year: 2027,
      cycleId: 'c27',
      documentId: null,
      label: 'FY2027 AIP',
      moneyWord: 'Estimated cost',
      countWord: 'programs',
    },
    {
      kind: 'aip',
      year: 2026,
      cycleId: 'c26',
      documentId: null,
      label: 'FY2026 AIP',
      moneyWord: 'Estimated cost',
      countWord: 'programs',
    },
    {
      kind: 'ordinance',
      year: 2026,
      cycleId: 'c26',
      documentId: 'd26',
      label: 'FY2026 Annual Budget',
      moneyWord: 'Appropriation',
      countWord: 'PPAs',
    },
  ],
  dimensions: {
    office: [
      { ...value('CHO'), clusterId: 'social' },
      { ...value('CPDO'), clusterId: 'governance' },
    ],
    sector: [value('3000'), value('1000')],
    fund: [value('GF'), value('SHF')],
    finishLine: [value('fl-1'), value('fl-2')],
    subFinishLine: [value('1.1')],
    cluster: [value('social'), value('governance')],
    theme: [value('climate'), value('gad')],
    expenseClass: [value('PS'), value('MOOE'), value('FE'), value('CO')],
    topic: [
      { ...value('health'), dbIds: [] },
      { ...value('planning'), dbIds: [] },
    ],
    label: [value('infrastructure'), value('health'), value('unclassified')],
    subLabel: [
      { ...value('infrastructure.drainage-flood'), parentId: 'infrastructure' },
    ],
  },
  // health: the CHO office or a row named "…clinic…"; planning: the CPDO office.
  topicRules: {
    health: [
      { kind: 'office', value: 'CHO' },
      { kind: 'keyword', value: '\\bclinic' },
    ],
    planning: [{ kind: 'office', value: 'CPDO' }],
  },
  compounds: [],
  cards: [],
};
