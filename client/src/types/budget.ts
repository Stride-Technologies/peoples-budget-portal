export type PPAType = 'Program' | 'Project' | 'Activity';
export type ExpenseClass = 'PS' | 'MOOE' | 'CO' | 'FE';
export type Status = 'Draft' | 'Submitted' | 'Approved' | 'Returned' | 'Finalized';

export interface Department {
  id: string;
  name: string;
  code: string;
  officeType: string; // 01-Mandatory, 02-Optional, 03-Others
}

export interface FinishLine {
  id: string;
  name: string;
  shortName: string; // Short version for table display
  cluster: string;
  category: string;
  budgetCeiling: number; // Budget ceiling for this finish line
  visionNumber: number | null;
}

// Budget Line Item - Detailed object of expenditure
export interface BudgetLineItem {
  id: string;
  uacs_code: string; // UACS Object Code (e.g., 5-02-01-010)
  object_name: string; // e.g., "Office Supplies"
  expense_class: ExpenseClass; // PS, MOOE, CO
  description: string; // Specific description
  quantity: number;
  unit: string; // e.g., "reams", "liters", "units"
  unit_cost: number;
  total_cost: number; // quantity * unit_cost
  remarks?: string;
}

export interface AIPEntry {
  id: string;
  program_code: string;
  program_name: string;
  ppa_description: string;
  ppa_type: PPAType;
  department_id: string;
  sector: string;
  primary_finish_line_id: string;
  secondary_finish_line_id?: string;
  expected_output_mfo: string;

  // Budget breakdown (calculated from line items)
  budget_line_items?: BudgetLineItem[];
  ps_amount: number;
  mooe_amount: number;
  co_amount: number;
  total_amount: number;

  // Climate Change
  cc_typology_code?: string;
  cca_amount?: number;
  ccm_amount?: number;

  // Status and remarks
  status: Status;
  remarks?: string;
  reviewer_remarks?: string;
  lce_remarks?: string;
  approved_by?: string;

  // Hierarchy
  parent_id?: string;
  children?: AIPEntry[];

  created_date: string;
  updated_date: string;
}

export interface BudgetProposal {
  id: string;
  aip_entry_id: string;
  budget_year: number;
  budget_year_proposed: number;
  status: Status;
  lfc_remarks?: string;
  lce_remarks?: string;
}

// User role/office assignment
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Department Staff' | 'Office Head' | 'Executive' | 'LCE' | 'CPDO';
  department_id: string;
  department_name: string;
}
