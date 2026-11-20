-- Data migration: replace acronym values stored in the `name` column with full office names.
-- The seed inserts `name` from clusters.json which already has full names;
-- this brings existing rows (seeded before that fix) in sync.

UPDATE city_offices
SET name = CASE acronym
  -- Governance
  WHEN 'CMO'          THEN 'City Mayor''s Office'
  WHEN 'CMO-NCYDO'    THEN 'Naga City Youth Development Office'
  WHEN 'CMO-MNDC'     THEN 'Metro Naga Development Council'
  WHEN 'CMO-LBO'      THEN 'Lingkod Barangay Office'
  WHEN 'CMO-SPORTS'   THEN 'City Mayor''s Office - Sports Development Division'
  WHEN 'LDF'          THEN 'Local Development Fund'
  WHEN 'SPA'          THEN 'Sangguniang Panlungsod Administration'
  WHEN 'OCA-MAIN'     THEN 'Office of the City Administrator - Main'
  WHEN 'OCA-IGOV'     THEN 'Office of the City Administrator - iGovernance'
  WHEN 'OCA-JMRCGG'   THEN 'Jesse M. Robredo Center for Good Governance'
  WHEN 'SP'           THEN 'Sangguniang Panlungsod'
  WHEN 'CACCO'        THEN 'City Accounting Office'
  WHEN 'CASSO'        THEN 'City Assessor''s Office'
  WHEN 'IAS'          THEN 'Internal Audit Services'
  WHEN 'CBO'          THEN 'City Budget Office'
  WHEN 'CPO'          THEN 'City Population Office'
  WHEN 'CTO'          THEN 'City Treasurer''s Office'
  WHEN 'CPDO'         THEN 'City Planning and Development Office'
  WHEN 'ITO'          THEN 'Information Technology Office'
  WHEN 'HRMO'         THEN 'Human Resource Management Office'
  WHEN 'CLO'          THEN 'City Legal Office'
  -- Economy
  WHEN 'BCS'          THEN 'Bicol Central Station'
  WHEN 'MEPO'         THEN 'Market Enterprise and Promotion Office'
  WHEN 'NCDA'         THEN 'Naga City Council on Disability Affairs'
  WHEN 'CAgO'         THEN 'City Agriculture Office'
  WHEN 'NCCDO'        THEN 'Naga City Cooperative Development Office'
  WHEN 'ITPO'         THEN 'Investment and Tourism Promotions Office'
  WHEN 'METRO PESO'   THEN 'Metro Naga Public Employment Service Office'
  WHEN 'ABE'          THEN 'Agricultural and Biosystems Engineering'
  -- Safety & Security
  WHEN 'PSO'          THEN 'Public Safety Office'
  WHEN 'GSO'          THEN 'General Services Office'
  WHEN 'CDRRMO'       THEN 'City Disaster Risk Reduction and Management Office'
  WHEN 'NCDDB'        THEN 'Naga City Dangerous Drugs Board'
  -- Environment & Infrastructure
  WHEN 'ENRO'         THEN 'City Environment and Natural Resources Office'
  WHEN 'SWMO'         THEN 'Solid Waste Management Office'
  WHEN 'BMEECO'       THEN 'Bicol Medical Center / Bicol Economic Zone Development'
  WHEN 'CEO'          THEN 'City Engineer''s Office'
  WHEN 'HSDO'         THEN 'Housing and Settlements Development Office'
  WHEN 'CPRFMO'       THEN 'City Parks & Recreational Facilities Management Office'
  WHEN 'WSD'          THEN 'Water Services Division'
  -- Education
  WHEN 'ESSO'         THEN 'Education, Sports and Scholarships Office'
  WHEN 'CCN'          THEN 'City College of Naga'
  WHEN 'ECCD'         THEN 'Early Childhood Care and Development'
  WHEN 'BSTC'         THEN 'Bicol Science and Technology Centrum'
  WHEN 'RSRL/ROCO'    THEN 'Raul S. Roco Library'
  -- Health
  WHEN 'CHO 1'        THEN 'City Health Office I'
  WHEN 'OLLI'         THEN 'Our Lady of Lourdes Infirmary'
  WHEN 'CVO'          THEN 'City Veterinary Office'
  WHEN 'CHO II'       THEN 'City Health Office II'
  WHEN 'CPNO'         THEN 'City Population and Nutrition Office'
  -- Social
  WHEN 'NCCWPC'       THEN 'Naga City Council for the Welfare and Protection of Children'
  WHEN 'NCCW/NCGADC'  THEN 'Naga City Council for Women'
  WHEN 'OSCA'         THEN 'Office of the Senior Citizens Affairs'
  WHEN 'PDAO'         THEN 'Persons with Disability Affairs Office'
  WHEN 'CSWDO'        THEN 'City Social Welfare and Development Office'
  -- Arts & Culture
  WHEN 'CEPPIO'       THEN 'City Events, Protocol, and Public Information Office'
  WHEN 'CCRO'         THEN 'City Civil Registry Office'
  ELSE name
END;
