# Local CCET typology codes — catalog for sign-off

Source: Climate Change Commission, *Climate Budgeting for Local Government Training Manual*
(<https://climate.gov.ph/files/4-CCET.pdf>), the local typology under DBM–CCC JMC 2015-01. Extracted by word
position with `pdftotext -bbox` and loaded into `api/prisma/data/climate-typology-codes.json` (replacing the
twelve `CCA_001`… placeholders, which are deactivated, not deleted).

The national typology (CCC *Typology Code Manual*) is **not** mixed in: the CCC notes local codes differ from
national ones, and the same code can mean different things in each.

## Repairs made to the source text

- p18: A114-10 printed at the head of its run, read as A114-01
- p18: M114-10 printed at the head of its run, read as M114-01
- p23: "4222-03" read as A222-03
- Spelling of extraction artefacts fixed: `cl/mate`, `hydrormet`, `darns`, `LG Us`, `p opulated`, a stray `1`.
- As printed (not repaired): A114-02 and A114-03 carry identical text; there is no A114-07 or A224-04.

## Workbook codes this catalog does not contain

| Code in workbook | Rows | Note |
|---|---|---|
| `A524-01` | CAgO r21, r22 | in the *national* manual only — ask CPDO for the local code |
| `M1314-01` | ENRO r19 | not a code shape in either manual (M314-01? — not guessed) |

## The catalog (263 codes)

| Code | Pillar | Description | Page |
|---|---|---|---|
| `A111-01` | A | Incorporate climate change and climate variability considerations in policies and Institutions | 11 |
| `A111-02` | A | Regulate commodity shifting and agricultural land conversion* | 11 |
| `A111-03` | A | Design and implement climate change risk transfer and social protection mechanisms in agriculture and fisheries* | 11 |
| `A111-04` | A | Incorporate risks from climate change and climate variability in irrigation/water management planning | 11 |
| `A112-01` | A | Conduct agricultural vulnerability and risk assessments, Impact assessments and simulation models on major crops and livestock * | 11 |
| `A112-02` | A | Develop, test and popularize climate-resilient crop and livestock production systems and technologies* | 11 |
| `A112-03` | A | Research on new threats to agriculture, fishing, and forestry from CC and CV | 17 |
| `A112-04` | A | Produce and distribute climate resilient rice varieties | 17 |
| `A113-01` | A | Awareness raising of risks from climate change, or/and benefits of adaptation’ | 17 |
| `A113-02` | A | Establish climate Information systems and database/resource network for agriculture and fisheries sectors* | 18 |
| `A113-03` | A | Establish and/or popularize farmers’ field school/climate field school to demonstrate best adaptation practices’ | 18 |
| `A113-04` | A | Develop formal and non-formal training programs on climate change adaptation (CCA) and disaster risk reduction (DRR) | 18 |
| `A113-06` | A | Conduct of non-farm entrepreneurial courses | 18 |
| `A113-07` | A | (SALT) training and other soil conservation measures in sloping lands for farmers | 18 |
| `A113-08` | A | Improve the adaptive capacity of farmers and fisher-folk through the provision of relevant technologies and information | 18 |
| `A114-01` | A | Establish early warning systems for agriculture* | 18 |
| `A114-02` | A | Introduce or expand use of crops or crop mix more suited to climate change and climate variability | 18 |
| `A114-03` | A | Introduce or expand use of crops or crop mix more suited to climate change and climate variability | 18 |
| `A114-04` | A | Reduce vulnerability of crop storage facilities and irrigation systems to climate change and climate variability* | 18 |
| `A114-05` | A | Construct/Repair/Rehabilitate national and communal irrigation systems, dams and water storage systems to manage changes in the water cycle due to climate change and climate variability* | 18 |
| `A114-06` | A | Introduce weather or climate indexed insurance program (e.g. crop insurance) | 18 |
| `A114-08` | A | Change management practices or techniques to reduce vulnerability to climate change and climate variability in animal health service, pasture management, fodder production and storage practices | 19 |
| `A114-09` | A | Develop innovative financing mechanisms to provide seed capital for the implementation of CCA among farmers and fisher-folk organization* | 19 |
| `A114-10` | A | Construct water impounding dams, rainwater harvesting facilities for irrigation, and water storage systems to manage changes in the water cycle due to CC and CV | 19 |
| `A114-11` | A | Construct crop storage facilities that consider climate change and variability | 19 |
| `A114-12` | A | Promote agro-forestry such as cacao/ coffee/rubber production and seedling distribution | 19 |
| `A114-13` | A | Establish Integrated Pests Management | 19 |
| `A114-14` | A | Develop climate resilient livestock production system and technologies | 19 |
| `A121-02` | A | 1- Policy Development and Governance “Formulate/implement ordinances on reversion of abandoned fishponds back to mangroves* | 19 |
| `A121-03` | A | Harmonize climate change adaptation plans in local resource management and local fisheries development* | 19 |
| `A122-01` | A | Conduct of provincial-level vulnerability and risk assessments for fisheries* | 19 |
| `A122-02` | A | Conduct researches on best practices in fisheries and coastal climate change adaptation, technologies and tools* | 19 |
| `A122-04` | A | Develop and/or update climate change R&D agenda for fisheries sectors* | 20 |
| `A122-05` | A | Promote fish farming and aquaculture practices or techniques to reduce vulnerability to CC&CV (i.e. due to changes in water quality or variation in fishing season). | 20 |
| `A122-06` | A | Establish climate information systems and database for fisheries sector* | 20 |
| `A123-01` | A | Establish a resource network / information system and database on Ornate change and fisheries* | 20 |
| `A124-02` | A | 4 - Service Delivery Establish early warning systems for fisheries. | 20 |
| `A211-01` | A | 1- Policy Development and Governance Develop ordinances, policies and guidelines for water conservation, allocation, recycling and reuse* | 20 |
| `A211-02` | A | Review and streamline existing water resources management and institutional structure and policies* | 20 |
| `A211-03` | A | Develop and implement a comprehensive ground water management program that includes vulnerability assessment* | 20 |
| `A211-04` | A | Develop public financing mechanism far water supply infrastructures rehabilitation and development* | 20 |
| `A211-05` | A | Incorporate risks from climate change and climate variability in water, sanitation and flood protection planning | 20 |
| `A211-06` | A | Review financing, tariffs, and system of incentives to reflect the full cost of providing safe waters* | 20 |
| `A212-01` | A | Study “low cost, no regrets” adaptation measures and technologies under various hydrologic conditions, supply-demand conditions, and policy scenarios for surface and groundwater systems* | 21 |
| `A212-02` | A | Define areas not suitable for large water infrastructure development and settlements based on vulnerability assessment. | 21 |
| `A212-03` | A | Conduct ground water resource vulnerability and recharge areas assessment in water stressed cities* | 21 |
| `A212-05` | A | Identify alternative water sources and demand management especially for urbanized areas that rely on reservoirs and are prone to recurrent and severe drought events* | 21 |
| `A212-06` | A | Study and adopt centralized wastewater treatment systems to improve quality in highly urbanized and densely populated areas | 21 |
| `A212-07` | A | Conduct water resource supply and demand analysis under various hydrologic -conditions and climate scenarios* | 21 |
| `A212-08` | A | Incorporate water cycles change from CC & CV into trans-boundary water basin planning | 21 |
| `A213-01` | A | Training for community-based water associations to manage water supply infrastructures | 21 |
| `A213-02` | A | Conduct Integrated Water Resource Management and CC adaptation and disaster risk reduction training for vulnerable communities* | 21 |
| `A213-03` | A | Develop Rendered and accessible knowledge products and IEC materials that include local and indigenous knowledge on water resources management, CC impacts on water resources and adaptation best practices* | 21 |
| `A213-04` | A | Develop and network government database on water resources and users* | 21 |
| `A214-01` | A | Incorporate climate change and climate variability fn water supply infrastructure/ Rehabilitate water infrastructure with climate lens (use of climate projections arid other relevant climate data)* | 22 |
| `A214-02` | A | Construct new and expand existing water supply infrastructures for waterless communities* | 22 |
| `A214-03` | A | Treatment of wastewater for conservation/re-use purposes to respond to declines in water availability due to climate change and climate variability | 22 |
| `A214-04` | A | Incorporate changes in design of sanitation systems, wastewater treatment and disposal system in response to extreme weather and flood events arising from climate change and climate variability | 22 |
| `A214-05` | A | Implement/install water harvesting technologies* (e.g. small water impounding project) | 22 |
| `A221-01` | A | Formulate and implement ordinances and policies for rain water collection, such small water impoundments, retarding basins, mini dams to address Water shortage and flooding* | 22 |
| `A221-02` | A | Design guidelines, emergency protocols, and encourage preparedness and risk/contingency planning in communities that are at risk to present or future flooding | 22 |
| `A222-01` | A | Conduct vulnerability assessments in communities, LGUs, and sectors that are at risk to present or future flooding | 22 |
| `A222-02` | A | Improve hydromet infrastructure and monitoring systems for data collection and management and the development and delivery of information, products and services to increase flood resilience | 23 |
| `A222-03` | A | Develop innovative technologies and methodologies to communicating flood emergency information and longer-term risks of flooding to relevant populations and communities | 23 |
| `A223-01` | A | Build local capacity for the management of climate change and extreme flood risks, and increase capacity in conducting vulnerability assessments | 23 |
| `A223-02` | A | Increase knowledge to consider climate change information and climate risk in water resources management | 23 |
| `A224-01` | A | Incorporate climate change and climate variability in design standards for flood control and drainage systems | 23 |
| `A224-02` | A | Improve resilience of infrastructure (bridges water supply, community infrastructure, water storage, coastal defense, etc) to account for climate change and climate variability related extreme weather and climate variability that could increase flood risks in infrastructure | 23 |
| `A224-03` | A | Protect or re-establish mangrove forests, wetlands, and other ecosystems as protection against floods risks | 23 |
| `A224-05` | A | Improve early warning information and alert systems to increase readiness to extreme flood risks | 23 |
| `A231-02` | A | Design guidance for incorporating climate change risk into water sanitation and treatment planning, operation, and management (including accounting for increased construction and maintenance costs that account for climate risk) | 24 |
| `A231-03` | A | Incorporate risk of sea level rise, storm surge, and saltwater intrusion on the design and upgrades of coastal water sanitation infrastructure | 24 |
| `A232-01` | A | Study and adopt centralized wastewater treatment systems to improve quality in highly urbanized and densely populated areas with respect to Increased flooding, storm surge, and extreme precipitation events | 24 |
| `A232-02` | A | Conduct vulnerability assessments for the sanitation and treatment of water supply | 24 |
| `A233-01` | A | Increase local knowledge for how to consider climate change Information and climate risk in water quality and wastewater treatment | 24 |
| `A234-01` | A | Expand the establishment of alternative micro-water purification systems especially to areas that cannot be reached by safe water supply* | 24 |
| `A234-02` | A | Monitor impact of climate change and climate variability as part of water resource management | 24 |
| `A234-03` | A | Incorporate changes in design of sanitation systems, wastewater treatment and disposal system in response to extreme weather and flood events arising from climate change and climate variability | 24 |
| `A311-01` | A | Design and implement payments for environmental services and other innovative conservation financing mechanisms to support ecosystem- based adaptation and mitigation* | 25 |
| `A311-03` | A | Design and implement payments for environmental services and other innovative conservation financing mechanisms to support ecosystem- based adaptation and mitigation* | 25 |
| `A311-05` | A | Develop guidelines for implementing Integrated Water Resources Management (1WRM) and climate change adaptation at the local, watershed and river basin level* | 25 |
| `A311-06` | A | Formulate ordinances/policies to reduce the human-related impacts to coral reefs to help lessen the reefs’ vulnerability to climate change | 25 |
| `A312-01` | A | Conduct ecosystems vulnerability and risk assessment* | 25 |
| `A312-02` | A | Study, design and implement financing mechanisms for IWRM and climate change adaptation implementation in critical watersheds and river basins* | 25 |
| `A313-01` | A | 3 - Knowledge Sharing and Capacity Building Training on vulnerability and risk assessments* | 25 |
| `A313-03` | A | Establish management information system for different ecosystems that link various data sources* | 25 |
| `A313-04` | A | Document and disseminate best practice; including climate change responsive indigenous practices’ | 25 |
| `A313-05` | A | Festivals and events which advocate the protection and preservation of nature | 25 |
| `A314-01` | A | Delineate/Rehabilitate/Reforest degraded watersheds and forest areas | 25 |
| `A314-02` | A | Conserve and protect existing watershed and protected areas | 26 |
| `A314-03` | A | Delineate “ridge-to-reef” ecosystem- based management zones for the ecotowns through multi stakeholder process” | 26 |
| `A314-04` | A | Update status of Protected Areas and Key Biodiversity Areas from results from the vulnerability and risk assessment* | 26 |
| `A314-06` | A | Improve physical system performances river basins | 26 |
| `A314-07` | A | Seedling production; management of mangrove nursery | 26 |
| `A314-08` | A | Agro-Forestry to diversify farmers’ incomes and provide alternatives livelihood during extreme weather events (i.e. drought) | 26 |
| `A314-09` | A | Integrated tree planting along riverbanks/river bank rehabilitation I that re-duce the risk of flooding | 26 |
| `A314-10` | A | Establishment of database network on wildlife, genetic biodiversity and biosafety | 26 |
| `A321-01` | A | Incorporate change in design of solid waste management systems in response to extreme weather and flood events arising from CC&CV | 26 |
| `A411-01` | A | 1-Policy Development and Governance Develop guidelines on treatment of health issues due to climate change and climate variability | 27 |
| `A411-02` | A | Include climate related diseases in basic benefits of insurance policies | 27 |
| `A411-03` | A | Develop policy requiring integration of climate change and disaster risk reduction concepts and approaches in medical and allied health training courses* | 27 |
| `A411-04` | A | Develop and implement monitoring health infrastructure damage and rehabilitation plan* | 27 |
| `A411-05` | A | Develop and implement post disaster epidemic outbreak management and disease surveillance system (ex. water-borne diseases and other health risks due to climate change)* | 27 |
| `A411-06` | A | Planning for Climate Change Adaptation for health sector | 27 |
| `A414-04` | A | Development of I/veld-load diversification strategies to reduce dependence of climate related income opportunities | 29 |
| `A414-05` | A | Implement program for community health emergency preparedness and response* | 29 |
| `A414-06` | A | Development of social protection strategies to respond to climate change and climate variability | 29 |
| `A421-01` | A | Mainstreaming of CC-DRRM in local plans* (PDPFP, CLUP, CDP, ELA) | 29 |
| `A421-02` | A | Incorporate vulnerability to CC and CV in housing design standards | 29 |
| `A421-03` | A | Develop green building ordinance/ rating scheme, specifications and criteria* | 29 |
| `A421-04` | A | Develop and implement programs and incentive system for CC proofing arid retrofitting water infrastructure at the household/ community level” | 29 |
| `A421-05` | A | Regulate settlements in areas vulnerable to CC & CV | 29 |
| `A422-01` | A | Identify, map and profile areas and communities highly prone to climate related disasters* | 29 |
| `A422-02` | A | Conduct risk and vulnerability assessment* | 29 |
| `A422-03` | A | Conduct a study on population carrying opacity of areas and CC adaptive capacity of various communities | 29 |
| `A422-04` | A | Identify most CC vulnerable sectors and population* | 29 |
| `A422-05` | A | Conduct of CBMS with DRRM/ CCA | 29 |
| `A423-01` | A | Develop and implement knowledge management on climate change and disaster risks for local government units and communities* | 30 |
| `A423-02` | A | Increase local capacity for Forecasting, early warning (including indigenous systems) and disaster risk communication* | 30 |
| `A423-03` | A | Conduct training of trainers to respond to the needs of communities for CCA* | 30 |
| `A424-01` | A | Identify and implement gender- responsive sustainable livelihood and social protection programs for resettled and vulnerable poor families” | 30 |
| `A424-02` | A | Develop and implement post- disaster resettlement and counseling of displaced families and communities* | 30 |
| `A424-03` | A | Implement mixed-use, medium- to-high density developments, integrated land use-transport plan in developing new urban communities or in expanding existing ones* | 30 |
| `A424-04` | A | Expand the establishment of alternative micro-water purification systems especially to areas that cannot be reached by safe water supply* | 30 |
| `A424-05` | A | Develop and implement a CC adaptation plan (r settlement/ resettlement in consultation with affected communities, private sector, and civil society organization | 30 |
| `A424-06` | A | Construct new low-cost housing, relocation, and other mass dwellings to climate resilient design standards | 30 |
| `A424-07` | A | Reconstruction of housing projects damaged by calamities (Building Back Better) | 30 |
| `A424-08` | A | Relocating flood prone communities and commercial centers to safer areas | 30 |
| `A424-09` | A | Disaster and Climate Risk Monitoring System | 30 |
| `A424-10` | A | Install Early Warning Systems | 30 |
| `A511-01` | A | Promote public-private partnership to increase investments in the development of climate smart technologies, products and services | 32 |
| `A511-02` | A | Incorporate new CC&CV resilient design standards in new buildings | 32 |
| `A511-04` | A | Formulate/enhance tourism plans, policies and strategies to promote green tourism* | 32 |
| `A511-05` | A | Create an enabling ordinance/ policy for the development and implementation of climate-smart industries and services* | 32 |
| `A511-06` | A | Introduce regulations and programs to support climate resilient investments | 32 |
| `A512-01` | A | Identify the carrying capacity of tourism areas* | 32 |
| `A512-02` | A | Aquasilviculture Demo Farm to rehabilitate mangroves and address climate change and provide Livelihood | 32 |
| `A514-01` | A | Marketing and trade support for changing agricultural product mix in response to climate change and climate variability | 32 |
| `A514-02` | A | Support new income generating opportunities and industries utilizing natural resource better adapted to climate change and climate variability | 33 |
| `A514-03` | A | Retrofit assets and capital to protect against CC and CV | 33 |
| `A514-04` | A | Support industries that are better adapted to CC and CV (e.g. Tiger- grass production for agri-business) | 33 |
| `A611-04` | A | 1-Policy Development and Governance Mandatory implementation of AO110 and A0126 directing the institutionalization of Government Energy Management Program* | 33 |
| `A613-01` | A | Conduct sustainable and renewable energy resource assessments .(e.g. hydro, geothermal, biomass, wind, ocean and solar)* | 33 |
| `A613-02` | A | Conduct capacity building of community- based renewable energy organizations on system maintenance, energy efficiency and conservation, organizational development, tariff setting and management systems* | 34 |
| `A614-01` | A | Design and implement system of incentive for renewable energy for host communities and local government units that can be used for sustainable livelihood programs and climate change adaptation, measures* | 34 |
| `A624-02` | A | Flood protection or Irrigation from construction of dams or water storage system that manage changes in the water cycle due to CC & CV | 35 |
| `A624-03` | A | Improve design of solar panels to withstand higher intensity storms resulting from climate change and climate variability | 35 |
| `A624-04` | A | Improve design of solar panels to withstand higher intensity storms resulting from climate change and climate variability | 35 |
| `A624-05` | A | Secure access to water for crops used as bio-energy source | 35 |
| `A631-01` | A | Incorporate risks from climate change and climate variability in transportation system planning | 35 |
| `A634-01` | A | Protect transport infrastructure against extreme weather events (especially foods and storms) becoming more frequent and violent due to CC and CV | 35 |
| `A634-02` | A | Establish emergency services designed to cope with climate change and climate variability related emergencies in the transport sector | 36 |
| `A634-03` | A | Construct new roads, ports, airports and aviation infrastructure to climate resilient design standards | 36 |
| `A634-04` | A | Upgrade existing roads, ports and aviation infrastructure to climate resilient design standards | 36 |
| `A634-05` | A | Development of telecommunications infrastructure for use as part of an emergency response system during extreme weather events | 36 |
| `A634-06` | A | Enhance road maintenance to respond to climate change and climate variability | 36 |
| `A634-07` | A | Enhanced waterway maintenance to respond to climate change and climate variability | 36 |
| `A711-04` | A | Creation of offices with a mandate for climate change adaptation and mitigation | 36 |
| `A713-01` | A | Awareness raising programs on climate change and climate variability | 36 |
| `A713-02` | A | Training for pre-elementary, elementary, high school and college teachers on integrating climate change in basic courses* | 36 |
| `A713-03` | A | Upgrade personnel’s capacity and skills on climate change modeling and weather forecasting* | 36 |
| `A713-04` | A | Capacity building to address vulnerability to climate change and climate variability | 36 |
| `A713-05` | A | Climate Change 101 or Introductory Course on Climate Change | 36 |
| `A713-06` | A | Support to international campaigns that promote climate change adaptation and mitigation (e.g. Earth month) | 37 |
| `A714-01` | A | Review and development of curricula to take account of climate aspects in basic education, vocational training and other forms of follow-up training and education | 37 |
| `A714-02` | A | Review and revise, current textbooks, modules and exemplars for pre-elementary, elementary, for climate change content and gender- sensitivity | 37 |
| `A714-03` | A | Review and revise, current textbooks, modules and exemplars for high school and alternative learning system for climate change content and gender-sensitivity | 37 |
| `A714-05` | A | Improve government systems and infrastructure required for climate change modeling and climate forecasting* | 37 |
| `A714-06` | A | Establish centers on climate change adaptation/mitigation and best practices and innovations (e.g. Climate Change Academy) | 37 |
| `A811-01` | A | Introduce ordinances and programs to support climate resilient Investments | 37 |
| `A811-02` | A | Expand insurance eligibility populations vulnerable to climate related diseases | 37 |
| `A811-03` | A | Regulate or provide incentives in housing finance to encourage upgrading of existing real estate that reduces vulnerability to CC and CV | 37 |
| `A811-04` | A | Develop and introduce weather or climate indexed insurance programs (e.g. crop insurance) | 37 |
| `A812-04` | A | Economic analysis of financial needs for adapting to climate change and climate variability (cost of adaptation) | 38 |
| `A814-02` | A | Introduce green bonds or other securities specifically targeted at adaptation to climate change anti climate variability | 38 |
| `M111-01` | M | Enact/Implement ordinances and policies to reduce the emissions of greenhouse gases (GHGs) or absorption of GHGs in the agricultural sector | 11 |
| `M111-03` | M | Monitor carbon sequestration | 11 |
| `M112-01` | M | Develop, test and introduce practices or techniques that reduce GHG emissions and practices or techniques to sequester carbon dioxide (CO2) in crop production systems, animal husbandry systems, forest management systems and aquaculture management systems | 11 |
| `M112-02` | M | Sector studies, surveys, assessments on energy and water use efficiency in agriculture | 11 |
| `M113-01` | M | Establish or strengthen institutions, information systems and capacity building on energy and water use efficiency in agriculture sector | 17 |
| `M114-01` | M | Integrated organic and inorganic nutrient management | 18 |
| `M114-02` | M | Switch to soil management techniques that reduce GIG emissions or increase carbon sequestration | 18 |
| `M114-03` | M | Intensify or expand farm and fodder production using techniques that reduce GIG emissions or increase carbon sequestration | 18 |
| `M114-04` | M | Manure management and methane capture in animal husbandry | 18 |
| `M114-05` | M | Change forage systems to reduce ruminant methane emissions | 18 |
| `M114-06` | M | Introduce or expand water pumping for irrigation using renewable energy sources | 18 |
| `M114-07` | M | Replace existing water pumps with more energy efficient pumps | 19 |
| `M114-08` | M | Implement agricultural and fisheries waste recycling and composting* | 19 |
| `M114-09` | M | Switch to less water intensive crops | 19 |
| `M114-10` | M | Establish communal school gardens, and other community gardens for local consumption | 19 |
| `M121-01` | M | 1- Policy Development and Governance Formulate/implement ordinances to reduce tine emissions of GHGs, or absorption of GHGs in the fishing sectors | 19 |
| `M121-02` | M | Develop ordinances to reduce municipal fishing boats/improve fuel efficiency of municipal fishing boats | 19 |
| `M123-01` | M | Establish or strengthen institutions, information systems and capacity building on energy/ and water use efficiency in fishing sector | 20 |
| `M211-01` | M | 1- Policy Development and Governance Sector reform to improve water use efficiency to reduce energy use for pumping water (e.g. water pricing) | 20 |
| `M212-01` | M | Administration, sector studies, surveys, assessments, information systems and capacity building for energy and water use efficiency in water, sanitation and flood protection | 21 |
| `M214-01` | M | Reduce energy intensity of existing water supply systems (e.g. replacing pumps) | 22 |
| `M214-02` | M | Reduce or capture methane emission from ventilated improved pit latrines. | 22 |
| `M214-03` | M | Reduce per capita water consumption using demand-side interventions (e.g. household water, shower, toilet, and dishwasher) | 22 |
| `M214-04` | M | Reduce GHG emission {methane and nitrous oxide) from wastewater | 22 |
| `M214-05` | M | Reduce energy consumption during wastewater treatment (e- g_ from activated sludge to up flow anaerobic sludge). | 22 |
| `M312-01` | M | Greenhouse gas accounting and inventory | 25 |
| `M314-01` | M | Re-forestation and afforestation that increases vegetative cover or sequesters carbon | 25 |
| `M314-02` | M | Sustainable peat land/ wetland/ forest management and protection | 26 |
| `M314-03` | M | Avoided deforestation (e.g.. Bantay Gubat; Bantay Bakawan) | 26 |
| `M314-04` | M | Management and protection of Tree Parks/Provincial Forests and Nursery | 26 |
| `M314-05` | M | Oplan Sagip Kalikasan/Urban greening program | 26 |
| `M314-07` | M | Re-establish and protect mangroves, floodplains and seagrass beds with carbon sequestration properties | 26 |
| `M314-08` | M | Green charcoal briquetting facility that reduce deforestation | 26 |
| `M314-09` | M | Monitor illegal mining activities that emit greenhouse gases | 26 |
| `M321-01` | M | Develop and implement ordinances and policies that promote a system of incentives for the use of reusable bags and containers/ ban or impose a fee on the use of plastic bags* | 26 |
| `M322-01` | M | Conduct Waste Amount & Composition Study (WACS) | 26 |
| `M323-01` | M | 3 - Knowledge Sharing and Capacity Building Conduct intensive IEC on waste reduction, segregation and composting | 26 |
| `M324-01` | M | Waste reduction and diversion program/Intensify waste segregation at source, discard recovery, composting and recycling’ | 27 |
| `M324-02` | M | Construction and operation of Materials Composting and Recovery Facility (MRCF) Building; Buyback Center; Purchase of MRCF equipment | 27 |
| `M324-03` | M | Upgrade existing landfills to capture methane for energy generation or gas flaring for CO2 generation | 27 |
| `M324-04` | M | Establish and implement ecological solid waste management (ESW1v1) program in accordance with Republic Act 9003 | 27 |
| `M324-05` | M | Close solid waste management sites In environmentally critical areas | 27 |
| `M424-01` | M | Retrofit/ install new heating and cooling systems using renewable energy | 30 |
| `M424-02` | M | Promote/Build energy efficient ‘housing | 30 |
| `M511-01` | M | Introduce rules and regulations to reduce GHG emissions or absorb of GHGs in industry and trade | 32 |
| `M511-03` | M | Introduce a system of incentives to encourage the use of climate- smart technologies and practices | 32 |
| `M511-04` | M | Integrate monitoring of existing and new- climate smart Industries and services within existing business registration system* | 32 |
| `M511-05` | M | Implement a system of collection, analysis and reporting of baseline and new data on green jobs and employments | 32 |
| `M512-01` | M | Conduct baseline inventory of climate-smart industries and services and good practices in the local government unit* | 32 |
| `M512-02` | M | Baseline data on GHG emissions from industry arid other sources | 32 |
| `M512-04` | M | Forge partnerships with industry, academe, and research organizations on R&D of climate-smart technologies and products in the locality | 32 |
| `M513-01` | M | Develop modules and conduct trainings to capacitate industries to conduct GHG emissions inventory and carbon footprint* | 32 |
| `M514-01` | M | Marketing and trade support for products that reduce GHG emissions per unit of output | 32 |
| `M514-02` | M | Marketing and trade support for agricultural products that use integrated organic and inorganic nutrient management | 33 |
| `M514-03` | M | Rehabilitate/reforest degraded tourism areas | 33 |
| `M611-01` | M | 1-Policy Development and Governance Change operational procedures or techniques, or retrofit technologies to reduce GHG emissions in existing operations | 33 |
| `M611-03` | M | Develop/implement ordinances and policies to improve energy efficiency — in buildings, agriculture, industry and city/ municipal services (e.g. public building maintenance program to improve energy efficiency; use of more energy efficient street lighting such as LED). | 33 |
| `M611-04` | M | Develop a certification system/ incentives for voluntary adoption of energy efficiency labeling, green building rating, and ISO 50001 certification | 33 |
| `M611-05` | M | Develop a local renewable energy program* | 33 |
| `M612-02` | M | Sector studies, surveys, assessments and information systems on energy efficiency, efficient energy pricing, and promotion of renewable energy | 33 |
| `M613-01` | M | Sector reform and capacity building related to energy efficiency in energy sector, promotion of renewable energy and efficient energy pricing | 34 |
| `M613-02` | M | Strengthen regulatory and institutional framework to support expansion of renewable power generation | 34 |
| `M613-03` | M | Strengthening capacity of institutions to plan for low-carbon growth and environmentally sustainable energy supply | 34 |
| `M614-02` | M | Pilot programs on energy efficiency activities | 34 |
| `M621-04` | M | Develop RE project-based and service contracts-based portfolios to encourage potential investors in identified sites | 34 |
| `M622-02` | M | Conduct survey of RE potential in off-grid areas | 34 |
| `M623-01` | M | Conduct capacity building of community-based RE organizations on RE system maintenance, EE&C organizational development, tariff setting and management systems | 34 |
| `M624-06` | M | Development of renewable energy(i,e- Establishment of Solar Panels/ Installation of Wind Mill/Rio-Gas) | 35 |
| `M624-07` | M | Clean Cities initiatives or those that promote/increase uti4zation of alternative/clean Fuels for the transport sector (tricycle. jeepney, bus, private and government vehicles) | 35 |
| `M631-01` | M | Improve vehicle emission standards | 35 |
| `M631-02` | M | Improve Fuel efficiency standards | 35 |
| `M631-03` | M | Strengthen vehicle Inspection systems on emissions and fuel efficiency | 35 |
| `M631-04` | M | Develop ordinances/policies to encourage shift from higher carbon to lower carbon transport modes {i.e. pedestrianization, bicycle lanes, public transport} | 35 |
| `M633-01` | M | 3 - Knowledge Sharing and Capacity Building Capacity building related to energy efficiency in the transport sector 4 - Service Delivery | 35 |
| `M634-01` | M | Urban traffic management (e.g. improve traffic flow) to reduce GHG emissions per unit transported | 35 |
| `M634-02` | M | Improved waterways, port and aviation facilities to reduce the carbon intensity per unit transported | 36 |
| `M634-03` | M | New railway lines for electricity based rail-cars | 36 |
| `M634-05` | M | Improve energy efficiency in telecommunications information technologies | 36 |
| `M714-01` | M | Development of curricula or programs focused on reducing GHG emissions, energy consumption or water consumption for elementary and high school | 37 |
| `M811-01` | M | Introduce ordinances, programs or financial instruments to support GHG reducing activities | 37 |
| `M811-02` | M | Strengthen Institution and policies to mobilize carbon finance | 37 |
| `M811-03` | M | Prepare for carbon markets or implement carbon finance market transactions | 37 |
| `M811-04` | M | Develop ordinances or provide incentives in housing finance to support energy saving designs and standards | 37 |
| `M812-03` | M | Reduce fossil-fuel consumption through taxes, levies or fees on energy or transport services | 38 |
| `M813-01` | M | Strengthen LGUs In developing policies to mobilize carbon finance | 38 |
| `M814-01` | M | Provide lines of credit far investments in reduction of GHG emissions and/or absorption of GHGs | 38 |
| `M814-02` | M | Support to access carbon markets | 38 |
| `M814-03` | M | Introduce green bonds or other securities specifically targeted at reducing GHG emission or sequestering G1465 | 38 |
