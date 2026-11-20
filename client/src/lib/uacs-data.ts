/**
 * UACS (Unified Accounts Code Structure) Objects grouped by Expense Class
 * Used for budget line item entry in project/activity forms
 */

export interface UACSObject {
  code: string;
  description: string;
  expenseClass: 'PS' | 'MOOE' | 'FE' | 'CO';
}

export interface UACSObjectGroup {
  name: string;
  objects: UACSObject[];
}

export interface UACSCategory {
  name: string;
  expenseClass: 'PS' | 'MOOE' | 'FE' | 'CO';
  groups: UACSObjectGroup[];
  objects: UACSObject[];
}

export const uacsCategories: UACSCategory[] = [
  {
    name: 'PS - Personnel Services',
    expenseClass: 'PS',
    groups: [
      {
        name: 'Basic Salary',
        objects: [
          {
            code: '5-01-01-010',
            description: 'Salaries and Wages - Regular',
            expenseClass: 'PS',
          },
          {
            code: '5-01-01-020',
            description: 'Salaries and Wages - Casual/Contractual',
            expenseClass: 'PS',
          },
        ],
      },
      {
        name: 'Allowances',
        objects: [
          {
            code: '5-01-02-010',
            description: 'PERA (Personal Economic Relief Allowance)',
            expenseClass: 'PS',
          },
          {
            code: '5-01-02-020',
            description: 'Representation Allowance',
            expenseClass: 'PS',
          },
          {
            code: '5-01-02-030',
            description: 'Transportation Allowance',
            expenseClass: 'PS',
          },
          {
            code: '5-01-02-040',
            description: 'Clothing / Uniform Allowance',
            expenseClass: 'PS',
          },
        ],
      },
      {
        name: 'Other Compensation',
        objects: [
          {
            code: '5-01-03-010',
            description: 'Honoraria',
            expenseClass: 'PS',
          },
          {
            code: '5-01-03-020',
            description: 'Other Compensation',
            expenseClass: 'PS',
          },
        ],
      },
      {
        name: 'Benefits',
        objects: [
          {
            code: '5-01-04-990',
            description: 'Other Personnel Benefits',
            expenseClass: 'PS',
          },
        ],
      },
    ],
    objects: [],
  },
  {
    name: 'MOOE - Maintenance & Operating Expenses',
    expenseClass: 'MOOE',
    groups: [
      {
        name: 'Supplies & Materials',
        objects: [
          {
            code: '5-02-01-010',
            description: 'Office Supplies',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-01-020',
            description: 'Accountable Forms',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-01-030',
            description: 'Non-Accountable Forms',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-03-010',
            description: 'Fuel, Oil and Lubricants',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-03-090',
            description: 'Agricultural & Marine Supplies',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-03-100',
            description: 'Drugs and Medicines',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-03-110',
            description: 'Medical, Dental and Laboratory Supplies',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-05-010',
            description: 'Food Supplies',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-10-010',
            description: 'Semi-Expendable Machinery & Equipment',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-11-010',
            description: 'Semi-Expendable Furniture & Fixtures',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-99-990',
            description: 'Other Supplies & Materials',
            expenseClass: 'MOOE',
          },
        ],
      },
      {
        name: 'Utility Expenses',
        objects: [
          {
            code: '5-02-01-050',
            description: 'Water',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-01-060',
            description: 'Electricity',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-07-010',
            description: 'Telephone - Mobile',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-07-020',
            description: 'Telephone - Landline',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-07-030',
            description: 'Internet',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-07-040',
            description: 'Cable/Satellite/Streaming',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-07-050',
            description: 'Postage and Courier',
            expenseClass: 'MOOE',
          },
        ],
      },
      {
        name: 'General Services',
        objects: [
          {
            code: '5-02-03-050',
            description: 'Printing and Publication',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-04-010',
            description: 'Transportation and Delivery',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-11-020',
            description: 'Repairs & Maintenance - Buildings',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-11-030',
            description: 'Repairs & Maintenance - Machinery & Equipment',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-11-040',
            description: 'Repairs & Maintenance - Transportation Equipment',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-12-010',
            description: 'Consulting Services',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-99-010',
            description: 'Advertising, Promotional & Marketing',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-99-030',
            description: 'Rent/Lease - Building & Structures',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-99-040',
            description: 'Rent/Lease - Equipment',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-99-050',
            description: 'Membership Dues & Contributions',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-99-060',
            description: 'Subscription',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-99-070',
            description: 'Donations',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-99-080',
            description: 'Insurance',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-13-010',
            description: 'Training',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-13-020',
            description: 'Scholarship Grants/Expenses',
            expenseClass: 'MOOE',
          },
          {
            code: '5-02-99-990',
            description: 'Other MOOE',
            expenseClass: 'MOOE',
          },
        ],
      },
    ],
    objects: [],
  },
  {
    name: 'CO - Capital Outlay',
    expenseClass: 'CO',
    groups: [
      {
        name: 'Capital Assets',
        objects: [
          {
            code: '5-06-01-010',
            description: 'Land',
            expenseClass: 'CO',
          },
          {
            code: '5-06-02-010',
            description: 'Land Improvements',
            expenseClass: 'CO',
          },
          {
            code: '5-06-03-010',
            description: 'Buildings',
            expenseClass: 'CO',
          },
          {
            code: '5-06-05-010',
            description: 'Machinery & Equipment',
            expenseClass: 'CO',
          },
          {
            code: '5-06-06-010',
            description: 'Transportation Equipment',
            expenseClass: 'CO',
          },
          {
            code: '5-06-07-010',
            description: 'Furniture & Fixtures',
            expenseClass: 'CO',
          },
          {
            code: '5-06-08-010',
            description: 'Books',
            expenseClass: 'CO',
          },
          {
            code: '5-06-13-010',
            description: 'Information & Communication Technology Equipment',
            expenseClass: 'CO',
          },
          {
            code: '5-06-13-020',
            description: 'Information & Communication Technology Software',
            expenseClass: 'CO',
          },
        ],
      },
      {
        name: 'Infrastructure',
        objects: [
          {
            code: '5-06-04-010',
            description: 'Infrastructure Assets - Roads & Bridges',
            expenseClass: 'CO',
          },
          {
            code: '5-06-04-020',
            description: 'Infrastructure Assets - Flood Control',
            expenseClass: 'CO',
          },
          {
            code: '5-06-04-030',
            description: 'Infrastructure Assets - Water Supply',
            expenseClass: 'CO',
          },
          {
            code: '5-06-04-990',
            description: 'Other Infrastructure Assets',
            expenseClass: 'CO',
          },
        ],
      },
    ],
    objects: [],
  },
];

/**
 * Get UACS objects filtered by expense class
 */
export function getUACSByExpenseClass(expenseClass: 'PS' | 'MOOE' | 'FE' | 'CO'): UACSObject[] {
  return uacsCategories
    .filter((cat) => cat.expenseClass === expenseClass)
    .flatMap((cat) => cat.groups.flatMap((group) => group.objects));
}

/**
 * Get UACS object description by code
 */
export function getUACSDescription(code: string): string {
  for (const category of uacsCategories) {
    for (const group of category.groups) {
      const obj = group.objects.find((o) => o.code === code);
      if (obj) return obj.description;
    }
  }
  return code;
}
