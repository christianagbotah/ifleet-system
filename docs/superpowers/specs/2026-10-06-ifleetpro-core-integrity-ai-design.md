# iFleetPro Core Integrity & Advanced AI Design

**Date:** 2026-10-06  
**Status:** Proposed architecture approved in principle by product owner; written specification pending final review  
**Repository:** `christianagbotah/ifleet-system`  
**Target product:** iFleetPro fleet operations platform for owner-operated and managed commercial truck fleets, with special emphasis on cement/factory haulage in Ghana and West Africa.

## 1. Product intent

iFleetPro must become a trustworthy operating system for commercial trucking, not just a CRUD fleet database. The system must let a fleet owner, dispatcher, accountant, driver, supervisor and management team run the full haulage lifecycle from dispatch through loading, delivery, return, reconciliation, settlement, maintenance and profitability analysis.

The primary operating pattern is a truck and driver loading from a factory or depot, especially cement factories, then delivering to one or more customer locations. The system must make fuel use, odometer/mileage, route distance, cargo, cash, driver allowances, operating expenses, truck performance and trip profitability auditable and mathematically reliable.

The design preserves useful parts of the existing Next.js/Prisma/MariaDB application while hardening its business-critical core. It intentionally avoids a full rewrite.

## 2. Success criteria

The takeover is successful when:

1. Every completed trip can be independently reconciled from immutable operational events.
2. A fleet owner can explain every kilometre, litre of fuel, material quantity, cash expense and revenue amount attached to a trip.
3. Fuel efficiency is derived from authoritative measurements rather than a single mutable fuel field.
4. Truck odometer continuity is enforced and suspicious readings are automatically flagged.
5. Factory loading, weighbridge, waybill and delivery proof are first-class workflows.
6. Trip creation and lifecycle transitions are transactional and concurrency-safe.
7. Financial totals are reproducible and do not silently drift when records are edited.
8. Production database changes use reviewed migrations, health checks and rollback practices.
9. CI blocks unsafe changes before deployment.
10. AI features assist human operators with explainable evidence and never silently modify money, compliance status or safety-critical records without an explicit policy-approved action.

## 3. Architectural direction

The preferred strategy is **stabilize and progressively enhance the current product**.

The current application remains the system shell. We will introduce clear domain services around the most sensitive workflows rather than continuing to spread calculations across API routes and React components.

Core domain boundaries:

- **Trip Operations** — dispatch, assignment, status lifecycle, loading, delivery and return.
- **Vehicle Telemetry & Odometer** — authoritative mileage observations and continuity.
- **Fuel Operations** — purchases, issues, tank observations, reconciliation and efficiency.
- **Cargo & Weighbridge** — loaded quantity, gross/tare/net weight, shortages and variances.
- **Trip Finance** — revenue, expenses, allowances, tolls, advances and contribution margin.
- **Driver Operations** — driver tasks, evidence capture, compliance and settlement inputs.
- **Fleet Maintenance** — service schedules, faults, tyres, inspections and cost attribution.
- **Compliance** — DVLA, insurance, roadworthiness, licence/document expiry.
- **Evidence & Audit** — images, documents, signatures, receipts, GPS provenance and immutable audit events.
- **Analytics & AI** — forecasts, anomaly detection, optimization and management intelligence.

Business calculations should move into reusable domain functions/services with deterministic tests. API handlers should validate, authorize, call domain services and serialize results; they should not independently reimplement core calculations.

## 4. Canonical trip lifecycle

A canonical cement/factory haul should support:

1. **Planned / Scheduled**
   - client/order reference
   - loading factory/depot
   - destination or multi-drop stops
   - cargo/item and expected quantity
   - truck and driver assignment
   - expected route/distance
   - applicable zone/rate card

2. **Dispatched / En route to factory**
   - dispatch timestamp
   - authoritative trip-start odometer
   - start fuel/tank observation where available
   - odometer photo/evidence
   - assignment validation (truck availability, driver licence, truck compliance)

3. **Factory arrival / Queue**
   - GPS or manual arrival
   - queue start/end
   - depot/factory gate reference

4. **Loading**
   - loading start/end
   - supplier/loading point
   - cargo quantity and unit
   - loading reference/order number

5. **Weighbridge / Waybill**
   - tare, gross and net weight where applicable
   - declared versus verified quantity
   - waybill number
   - weighbridge ticket/evidence
   - variance flags

6. **Departed factory / In transit**
   - departure timestamp
   - route progress
   - toll/fuel/expense events
   - GPS and geofence events when connected

7. **Customer arrival / Offloading**
   - arrival timestamp
   - offloading start/end
   - delivered quantity
   - shortage/damage/returns
   - customer contact and destination

8. **Proof of delivery**
   - receiver name
   - signature/photo
   - stamped waybill or delivery note
   - optional geolocation
   - exception reason if no signature/evidence

9. **Return journey / Arrived base**
   - return mileage
   - final authoritative odometer
   - end fuel/tank observation where available
   - end-odometer photo

10. **Reconciliation**
    - mileage reconciliation
    - fuel reconciliation
    - trip expenses
    - cash advances/returns
    - shortages
    - revenue/rate verification
    - unresolved anomalies

11. **Financial close / Settlement**
    - approved trip financials
    - driver settlement inputs
    - invoice or receivable status
    - owner profitability

A trip may be operationally complete before it is financially reconciled. These states must be separate.

## 5. Trip Operations Ledger

The long-term source of truth should be a ledger of append-oriented events and observations rather than mutable summary fields alone.

Recommended concepts:

### 5.1 TripEvent

Existing trip events should be strengthened to hold:

- event type/status transition
- event timestamp
- actor/user/device
- source: manual, driver app, admin, GPS, import, integration, system
- optional latitude/longitude
- notes/reason
- metadata JSON

Invalid lifecycle transitions must be rejected by a central transition policy.

### 5.2 TripObservation

Introduce an operational observation entity for measurements such as:

- odometer
- fuel level
- tank reading
- temperature where relevant
- cargo count/weight
- GPS-derived distance checkpoint

Every observation should keep its source, timestamp, evidence and verification status.

### 5.3 TripReconciliation

A trip reconciliation record should store the frozen result of a reconciliation run:

- operational distance
- odometer distance
- GPS distance if available
- fuel purchased/issued
- estimated tank delta
- reconciled fuel consumption
- km/L
- L/100 km
- fuel cost/km
- operating cost/km
- revenue
- total variable cost
- allocated fixed cost if configured
- contribution margin
- exception count
- reconciliation status and approver

Derived numbers must be recalculable from underlying ledger entries.

## 6. Odometer and mileage integrity

Create a single authoritative odometer ledger per truck.

Each `OdometerReading` should include:

- truckId
- tripId when applicable
- reading
- recordedAt
- readingType: trip_start, trip_end, fuel, maintenance, inspection, manual_adjustment, import
- source
- evidence URL(s)
- capturedBy
- verification status
- adjustment reason
- predecessor reading reference when relevant

Rules:

- readings cannot normally decrease;
- a trip end reading cannot be below its trip start reading;
- the next trip's start should be checked against the previous verified reading;
- unrealistic jumps based on elapsed time or route should create an anomaly;
- corrections should not erase the historical reading; they create a superseding adjustment;
- `Truck.currentMileage` becomes a projection/cache of the latest verified reading, not an independently editable source of truth.

Distance metrics should distinguish:

- loaded distance;
- empty/return distance;
- total trip distance;
- GPS distance;
- odometer distance;
- unaccounted distance.

## 7. Fuel accounting and reconciliation

Fuel must be modeled as events, not a single trip value.

### 7.1 Fuel events

Fuel records should support:

- purchase at station;
- company fuel issue;
- external depot/factory fuel issue;
- emergency/manual fuel;
- tank measurement/level observation;
- reversal/correction.

Each event should contain:

- truck and trip relationship;
- driver where appropriate;
- litres;
- unit price and total cost;
- station/source;
- payment source;
- odometer reading;
- tank level before/after where measured;
- receipt/evidence;
- GPS/location;
- actor and timestamp;
- verification state.

### 7.2 Integrity rules

- truckId on a fuel event must match the assigned trip truck unless a privileged correction workflow is used;
- litres and cost must be positive for a normal purchase;
- unit cost should be derived and compared against configured/market/station price ranges;
- tank capacity must be checked against before/after levels and litres added;
- odometer continuity must be validated;
- duplicates should be detected using receipt, amount, station, timestamp and similarity rules;
- updates that affect financial totals must be audited.

### 7.3 Reconciled consumption

Where reliable fuel levels/tank readings exist:

`reconciled fuel consumed = opening tank quantity + fuel added - closing tank quantity`

Where tank observations are unavailable, the system may use fuel-added-based metrics but must clearly label them as less authoritative.

Metrics:

- km/L;
- L/100 km;
- fuel cost/km;
- fuel cost/trip;
- fuel cost/ton-km where weight exists;
- expected vs actual litres;
- expected vs actual fuel cost;
- variance percentage;
- truck rolling baseline;
- route/zone baseline;
- driver-adjusted baseline where statistically meaningful.

A multi-fill trip must aggregate all eligible events. No individual fuel log may overwrite the trip total.

## 8. Cargo, cement and weighbridge workflows

Cement/factory haulage requires quantity reconciliation independent of fuel.

Support both bag-based and weight-based cargo:

- expected bags/quantity;
- loaded quantity;
- delivered quantity;
- returned quantity;
- damaged quantity;
- shortage quantity;
- tare weight;
- gross weight;
- net weight;
- expected weight;
- variance.

Weight verification statuses should use a single canonical enum. Overweight/underweight should be represented either as explicit valid enum members or, preferably, as `variance_detected` plus a signed variance classification field. The API and Prisma enum must not disagree.

Each weighbridge record should support ticket number, checkpoint type, location, operator, timestamp and evidence image/document.

## 9. Trip financial model

Trip profitability should be deterministic and explainable.

### 9.1 Revenue

Revenue sources may include:

- zone/rate-card amount;
- per bag/tonne rate;
- contracted trip amount;
- multi-drop charge;
- additional approved surcharge;
- waiting/detention charge;
- return-load revenue.

Store the rate source/version used at booking so future rate changes do not alter historical trip economics.

### 9.2 Costs

Trip variable costs should include:

- fuel;
- tolls;
- driver trip allowance;
- approved trip expenses;
- parking/queue costs;
- loading/offloading charges where applicable;
- repairs directly attributed to the trip;
- penalties/fines where policy says they belong to trip economics.

Optional management accounting can allocate:

- maintenance cost/km;
- tyre cost/km;
- insurance allocation;
- licensing allocation;
- depreciation/lease;
- salaried driver cost;
- overhead.

Expose both **contribution margin** and **fully allocated margin** so owners can distinguish trip cash performance from accounting profitability.

## 10. Driver mobile/portal operations

Drivers should be able to perform only authorized operational actions:

- view assigned trips;
- acknowledge trip;
- capture start odometer/photo;
- record factory arrival;
- queue/loading stages;
- capture waybill/weighbridge evidence;
- start journey;
- submit fuel/expense/toll evidence;
- record delivery arrival/offloading;
- capture POD and delivery exceptions;
- start return journey;
- capture final odometer/photo;
- submit trip for reconciliation;
- view approved settlement/allowance information appropriate to their role.

Drivers must not see owner-sensitive commercial information unless explicitly configured.

The driver flow must be optimized for mobile devices and unreliable connectivity. A later phase should add offline-capable draft/event capture and queued synchronization.

## 11. Security and environment remediation

Before production feature expansion:

- rotate any database/password/webhook/API credentials ever committed to git;
- remove sensitive values from tracked documentation;
- consider history rewriting if practical, while assuming exposed secrets are permanently compromised regardless;
- stop using production DB as the default development database;
- restrict database network access to required hosts/VPN/private network;
- create separate development, staging and production configurations;
- use secret storage/environment injection rather than documentation;
- remove trust in client-supplied legacy `x-auth-*` headers at application boundaries unless they are injected exclusively by a trusted internal proxy and are cryptographically/architecturally protected;
- review all public API exceptions;
- add authorization tests for Driver/Manager/Admin permissions;
- add sensitive-data redaction to logs;
- add login/session/audit monitoring.

## 12. Transactions, concurrency and immutable accounting

Critical workflows must use database transactions.

Transactional candidates:

- trip creation plus trip items/destinations and sequence assignment;
- trip completion and reconciliation state updates;
- fuel event plus derived projection updates;
- odometer event plus truck mileage projection;
- settlement creation/approval/payment;
- inventory/material movements where introduced;
- invoice/payment actions.

Trip numbers must be generated using a concurrency-safe sequence/identifier strategy rather than `count + 1`.

Derived financial values should never depend on partially completed writes.

## 13. Database migration policy

Replace production `prisma db push` as the normal deployment path with versioned Prisma migrations.

Deployment pipeline should perform:

1. dependency install with lockfile;
2. static checks/lint;
3. type checking;
4. unit/integration tests;
5. Prisma schema validation/generation;
6. migration safety checks;
7. build;
8. backup/pre-deploy checkpoint for production;
9. reviewed migration deployment;
10. application rollout;
11. health/smoke tests;
12. rollback/incident path when health checks fail.

## 14. Testing strategy

### 14.1 Calculation tests

Must cover:

- multi-fill trip fuel totals;
- tank-based fuel reconciliation;
- km/L and L/100km;
- negative/rollback odometer attempts;
- continuity across consecutive trips;
- cost/km;
- rate-card revenue;
- multi-drop revenue;
- contribution/full margin;
- weight variance;
- shortage calculations;
- driver settlement calculations.

### 14.2 API integration tests

Cover authorization, validation, duplicate handling, transaction rollback and lifecycle transitions.

### 14.3 End-to-end tests

At minimum:

- dispatcher creates trip;
- driver executes trip lifecycle;
- fuel and weighbridge evidence added;
- POD completed;
- return mileage recorded;
- reconciliation reviewed;
- invoice/settlement outputs produced;
- management dashboard reflects the closed trip.

## 15. Advanced analytics

Management analytics should expose:

- profitability by trip, truck, driver, route, zone, client, factory and cargo;
- km/L and L/100 km rolling trends;
- fuel variance;
- cost/km;
- revenue/km;
- revenue/ton-km;
- loaded vs empty kilometre ratio;
- truck utilization;
- driver utilization;
- queue/waiting/detention time;
- on-time delivery;
- maintenance downtime;
- maintenance cost/km;
- tyre cost/km;
- breakdown frequency;
- delivery shortage/damage rates;
- client payment exposure;
- fleet cash requirements;
- compliance expiry risk.

## 16. Advanced AI architecture

AI must be **assistive, evidence-grounded and auditable**. Critical actions remain deterministic business logic.

### 16.1 AI Dispatch Copilot

Recommend the best truck/driver assignment using:

- availability;
- truck capacity/type;
- maintenance/compliance state;
- driver licence/class;
- route familiarity;
- historical route performance;
- current location where available;
- driver hours/workload;
- fuel efficiency;
- client/factory constraints.

Output should include a score, ranked alternatives and plain-language reasons. The dispatcher confirms the assignment.

### 16.2 Fuel Theft & Anomaly Intelligence

Combine deterministic rules with statistical/ML anomaly scoring for:

- unusual litres relative to tank capacity;
- duplicate/near-duplicate receipts;
- fuel purchases too close together;
- implausible odometer differences;
- price deviations;
- abnormal route-specific consumption;
- truck baseline deviation;
- driver/truck pattern shifts;
- fuel event outside expected route/geofence;
- high fuel addition without corresponding distance;
- suspicious tank-level changes.

AI should present evidence and anomaly confidence rather than automatically accusing a driver.

### 16.3 Predictive Maintenance

Use odometer, engine/service history, fault/inspection history, tyre records, route severity and breakdown patterns to estimate:

- next likely service need;
- component risk;
- days/km to recommended intervention;
- downtime risk;
- expected maintenance budget;
- vehicles that should not receive long/high-load assignments.

Rule-based maintenance schedules remain authoritative until model performance is validated.

### 16.4 Route & ETA Intelligence

When mapping/traffic data is available:

- expected route distance/time;
- factory queue/dwell expectations;
- route risk alerts;
- ETA forecasts;
- excessive detour detection;
- empty-return optimization;
- nearby reload/backhaul opportunity ranking.

### 16.5 Driver Safety & Efficiency Score

Create explainable component scores rather than a black-box single rating:

- fuel efficiency;
- on-time performance;
- odometer/evidence integrity;
- trip exception rate;
- safety/inspection events;
- harsh driving/telematics where available;
- route adherence;
- cargo shortage/damage record;
- compliance behaviour.

Scores must be normalized for route/truck/load difficulty before being used for incentives or disciplinary decisions.

### 16.6 Document Intelligence

AI/VLM/OCR-assisted capture for:

- waybills;
- weighbridge tickets;
- fuel receipts;
- expense receipts;
- invoices;
- DVLA/insurance/roadworthy documents;
- POD forms.

Extraction can prefill fields but must preserve the original image/document and expose confidence per field. Low-confidence or financially material fields require review.

### 16.7 Trip Exception Copilot

On completion, automatically summarize:

- unexplained mileage;
- fuel variance;
- cargo variance;
- missing evidence;
- late delivery/waiting causes;
- excess expenses;
- compliance exceptions;
- suggested reconciliation actions.

### 16.8 Profitability & Cash Forecasting

Forecast:

- route/trip contribution margin;
- fuel spend;
- maintenance spend;
- expected fleet cash requirement;
- receivables/cash-flow pressure;
- truck replacement economics.

Forecasts must show assumptions and confidence ranges.

### 16.9 Fleet Management Copilot

A natural-language management interface may answer questions such as:

- Which trucks consumed more fuel than expected this month?
- Why did Truck X's cost/km rise?
- Which routes are most profitable?
- Which drivers have unexplained mileage?
- Which vehicles are due for service next week?
- Which completed trips are not reconciled?
- Which clients owe the most?
- What are today's operational exceptions?

The copilot should use structured application data through controlled server-side tools, not unrestricted SQL generated by the model.

### 16.10 AI Governance

Every material AI recommendation should store:

- model/provider/version;
- timestamp;
- input feature references or data snapshot identifier;
- output/recommendation;
- confidence;
- user acceptance/rejection when applicable;
- final outcome where available.

Never allow LLM output alone to:

- approve/pay money;
- alter odometer/fuel source records;
- change compliance status;
- mark a truck safe/unsafe;
- discipline a driver;
- delete evidence;
- close a financial reconciliation.

## 17. Rules engine before ML

Several advanced features should begin with transparent rules so value arrives before enough training data exists.

Examples:

- odometer rollback;
- impossible average speed;
- tank overflow;
- fuel-price deviation;
- missing start/end evidence;
- document expiry;
- truck maintenance due;
- abnormal queue duration;
- trip without POD;
- unresolved cargo shortage;
- fuel-to-distance threshold breach.

Once sufficient validated historical data exists, statistical/ML models can supplement these rules.

## 18. Integration roadmap

Future integrations should be isolated behind adapters:

- GPS/telematics providers;
- Google Maps/Mapbox/other routing providers;
- fuel-card/fuel-station providers;
- Hubtel/SMS/WhatsApp/email;
- accounting/ERP export;
- payment providers;
- factory/order integrations;
- weighbridge hardware/API feeds;
- mobile push notifications.

No provider-specific assumptions should leak deeply into trip domain logic.

## 19. Data provenance and audit

For material fields, the system should answer:

- who supplied this value;
- when;
- from what source/device;
- what evidence supported it;
- whether it has been verified;
- what value it replaced;
- who approved the correction.

Financial and operational audit events should be immutable from normal application workflows.

## 20. UX direction

Desktop management UI:

- exception-first dashboard;
- dense but readable operational tables;
- clear reconciliation status;
- drill-down from fleet → truck/driver/route → trip → source evidence;
- responsive layout;
- real-time updates where operationally useful.

Driver UI:

- large touch targets;
- one clear next action;
- camera-first evidence capture;
- minimal typing;
- offline-capable progression as a later hardening phase;
- low-bandwidth friendly.

Management dashboard:

- fleet health;
- active trips;
- delayed/exceptions;
- today's fuel;
- unreconciled trips;
- profitability;
- compliance/maintenance risk;
- AI recommendations requiring review.

## 21. Delivery phases

### Phase 0 — Security and production safety

- rotate exposed secrets;
- remove sensitive tracked documentation;
- isolate production DB;
- establish staging/dev database;
- introduce CI baseline and migration policy.

### Phase 1 — Core integrity

- odometer ledger;
- fuel aggregation/reconciliation;
- transactional trip create/update flows;
- concurrency-safe trip numbers;
- weighbridge enum/logic correction;
- lifecycle transition service;
- authoritative trip reconciliation calculations;
- calculation tests.

### Phase 2 — Cement haul operating workflow

- enhanced factory/loading/queue stages;
- weighbridge and waybill evidence;
- POD and shortage workflow;
- return journey/final mileage;
- trip reconciliation UI;
- driver workflow/mobile improvements.

### Phase 3 — Finance and owner economics

- trip cost ledger;
- deterministic profitability;
- driver allowance/advance reconciliation;
- client/rate versioning;
- owner dashboards and enhanced reports.

### Phase 4 — Advanced intelligence

- rules-based anomaly engine;
- fuel anomaly intelligence;
- dispatch copilot;
- route/ETA intelligence;
- maintenance prediction;
- document intelligence;
- exception copilot;
- driver efficiency/safety scoring;
- management copilot.

### Phase 5 — Scale and integrations

- GPS/telematics adapters;
- offline driver event sync;
- factory/weighbridge integrations;
- accounting/payment integrations;
- multi-company tenancy if product strategy requires SaaS expansion.

## 22. Initial non-goals

The first integrity programme will not:

- rewrite the whole frontend;
- replace Prisma/Next.js solely for architectural preference;
- make AI autonomous over financial/safety decisions;
- require telematics hardware before the core ledger works;
- build multi-company tenancy before core fleet accounting is correct.

## 23. Acceptance gates for Core Integrity milestone

Core Integrity is complete only when:

1. multi-fill trips aggregate fuel correctly;
2. mismatched truck/trip fuel events are rejected or explicitly corrected through privileged workflow;
3. odometer rollback/negative trip mileage is prevented;
4. consecutive trip mileage discontinuities are visible;
5. trip creation cannot leave orphaned partial item/destination records from an ordinary failure;
6. trip identifiers cannot collide under concurrent creation;
7. weight verification uses valid schema statuses;
8. profitability is generated from source ledgers and covered by tests;
9. production schema evolution uses versioned migrations;
10. CI runs lint/type/test/build gates;
11. no live credential is intentionally stored in tracked source/docs;
12. a dispatcher + driver + manager can complete a realistic cement delivery and reconcile it end-to-end in UAT.

## 24. Ownership principle

From this point forward, feature quantity is secondary to trustworthy operations. Every enhancement should answer three questions:

1. Is the source data authoritative and auditable?
2. Is the business calculation deterministic and tested?
3. Does the workflow reflect what the truck owner, dispatcher, driver and accountant actually do?

Advanced AI will be layered on top of that reliable operational foundation so that its recommendations improve decisions rather than amplify bad data.
