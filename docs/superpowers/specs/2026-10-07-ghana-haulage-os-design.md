# iFleetPro Ghana Haulage OS — Architecture Design

**Date:** 2026-10-07  
**Status:** Design approved in principle; implementation plan pending owner review  
**Repository:** `christianagbotah/ifleet-system`

## 1. Purpose

iFleetPro will evolve from a conventional fleet-management application into a Ghana-focused transport and haulage operating system for truck owners, transport companies, dispatchers, factories, distributors, drivers, finance teams, safety teams, customers and subcontracted hauliers.

The target operating environment includes haulage from factories, ports, depots and distribution centres such as cement, FMCG and industrial operations. The design is based on observed Ghanaian cargo-chain patterns: truck/driver verification, loading authorization, queueing, waybills, weight verification, axle-load compliance, monitored road movement, customer delivery, proof of delivery, expense reconciliation, driver/haulier settlement and invoicing.

The system must support factory-specific workflows without hard-coding GHACEM, Dangote, Unilever or any other shipper into core business logic.

## 2. Design goals

1. Model the actual Ghana haulage lifecycle from load order through settlement.
2. Support owner-operated fleets and subcontracted/third-party fleets.
3. Separate tractor heads from trailers because tractor/trailer combinations change between trips.
4. Make GPS/telematics hardware vendor-neutral.
5. Keep phone GPS as a useful fallback, not the primary trusted source for commercial fleets.
6. Support live tracking, geofencing, route replay, ETA and event-driven video review.
7. Add factory/depot gate, queue, loading, weighing and gate-out controls.
8. Digitise waybills and proof of delivery with strong evidence.
9. Enforce configurable Ghana/ECOWAS transport compliance rules with effective dates.
10. Provide complete trip profitability, driver reconciliation and haulier settlement.
11. Build AI features on trustworthy operational data rather than decorative dashboards.
12. Preserve and extend the useful modules already present in iFleetPro.

## 3. Non-goals for the first implementation

- Replacing factory ERP systems.
- Implementing proprietary factory APIs before credentials/contracts exist.
- Building a satellite communications network.
- Continuous cloud recording of every camera stream.
- Hard-coding current legal thresholds that cannot be changed without a deployment.
- Replacing DVLA, Ghana Highway Authority, GPHA or shipper systems of record.

## 4. Core operating model

The canonical haulage lifecycle is:

`Transport Order -> Assignment -> Eligibility Check -> Loading Authorization -> Factory Gate-In -> Queue -> Pre-Load/Tare -> Loading -> Gross/Axle Verification -> Waybill/Seal -> Gate-Out -> In Transit -> Destination Arrival -> Offloading -> ePOD -> Return/Next Assignment -> Reconciliation -> Driver/Haulier Settlement -> Customer Invoice -> Closed`

A trip may be single-drop or multi-drop. A load may originate from a factory, port, warehouse, depot, customer site or other configured loading point.

### 4.1 Trip state machine

The current `TripStatus` model is retained but expanded into explicit operational phases and guarded transitions.

Recommended states:

- `draft`
- `scheduled`
- `assigned`
- `eligibility_check`
- `authorized_for_loading`
- `en_route_to_loading_point`
- `gate_in`
- `queued`
- `preload_weighing`
- `loading`
- `loaded`
- `postload_weighing`
- `awaiting_dispatch_clearance`
- `departed_loading_point`
- `in_transit`
- `arrived_destination`
- `offloading`
- `delivered`
- `return_journey`
- `arrived_base`
- `awaiting_reconciliation`
- `reconciled`
- `completed`
- `delayed`
- `cancelled`
- `exception_hold`

Transitions must be performed through a domain service rather than arbitrary status updates. Each transition creates a `TripEvent` with actor, timestamp, location, evidence and metadata.

## 5. Actors and roles

### 5.1 Transport company roles

- Owner / Director
- Transport Manager
- Fleet Manager
- Dispatcher
- Operations Supervisor
- Safety / Compliance Officer
- Finance / Accountant
- Fuel Officer
- Maintenance Officer
- Driver
- Driver Assistant / Mate where required

### 5.2 External/partner roles

- Shipper / Factory Dispatcher
- Depot / Gate Officer
- Loading Supervisor
- Weighbridge Officer
- Customer / Receiver
- Subcontracted Haulier / Truck Owner
- Auditor / Read-only client user

RBAC must separate operational visibility from financial visibility. Drivers must not receive customer margin, owner settlement or unrelated fleet financial information.

## 6. Organisation and haulier model

Introduce a proper organisation layer.

### 6.1 `Organization`

Represents the tenant/operator using iFleetPro.

### 6.2 `Transporter`

Represents an internal fleet company or subcontracted haulier.

Fields include:

- legal name
- trading name
- registration/tax details
- primary contact
- address
- payment details
- contract status
- default settlement rules
- insurance/compliance metadata
- active/inactive status

### 6.3 `VehicleOwner`

Optional separate ownership record because the transporter operating a vehicle may differ from its legal owner.

### 6.4 Contracts and rates

`TransportContract` and `TransportRateCard` support:

- shipper/client
- loading point
- destination zone
- commodity/product
- unit (`trip`, `tonne`, `bag`, `pallet`, `km`, custom)
- vehicle/trailer type
- effective dates
- base rate
- fuel surcharge
- waiting/detention rate
- overnight allowance
- return-load rules
- deductions/penalties
- tax settings

This extends current `ZoneRate` instead of deleting it immediately. Existing rates are migrated into the new structure.

## 7. Vehicle asset model

### 7.1 Tractor head

The current `Truck` model becomes or maps to `Vehicle` with `assetType = TRACTOR_HEAD` for articulated operations. Rigid trucks remain supported.

Recommended fields:

- plate number
- VIN/chassis/engine
- make/model/year
- axle configuration
- tare weight
- gross vehicle weight rating
- fuel tank capacity
- transporter/owner
- assigned driver where applicable
- telematics device
- roadworthy/registration/insurance
- operating status

### 7.2 Trailer

Create `Trailer` as a first-class asset.

Fields:

- registration/plate
- chassis/VIN
- trailer type
- body type
- axle count/configuration
- tare weight
- max payload
- length/width/height
- transporter/owner
- telematics device where fitted
- roadworthy/inspection records
- status

### 7.3 Coupling history

Create `VehicleCombination` or `TrailerCoupling`:

- tractorId
- trailerId
- driverId
- coupledAt
- decoupledAt
- tripId
- location
- odometer
- actor

A trip stores the actual combination used, not only the tractor.

## 8. Driver eligibility and compliance

A driver/truck/trailer combination must pass an eligibility service before loading authorization.

Checks include:

- driver active/not suspended
- licence valid and correct class
- Ghana Card/identity verification where configured
- driver rest/hours rules
- tractor registration valid
- tractor roadworthy valid
- tractor insurance valid
- trailer compliance valid
- scheduled maintenance blocks
- tyre/critical defect blocks
- active safety holds
- shipper-specific qualification
- commodity-specific qualification

Failures are classified as blocking or warning. Overrides require permission, reason and audit trail.

## 9. Shipper and factory profiles

Create `ShipperProfile` to define configurable customer/factory rules.

A profile can define:

- shipper/client identity
- loading sites
- products/commodities
- allowed vehicle/trailer types
- documents required before gate-in
- waybill fields
- weighing stages
- seal requirements
- queue process
- loading capacity
- gate operating hours
- POD requirements
- accepted quantity variance
- permitted routes
- speed rules
- detention rules
- integration mode

Examples:

- Cement: bags/tonnes/bulk, tare/gross/axle controls, single or multiple drop, depot/customer delivery.
- FMCG: pallets/cartons/SKUs, delivery windows, multi-drop, returnable packaging, rejected/damaged goods.
- Industrial raw material: tonnes/bulk, weighbridge-heavy workflow, permits and special vehicle types.

## 10. Transport/load orders

Create `LoadOrder` as the commercial/operational instruction before a trip.

Fields include:

- shipper/client
- external order/reference
- loading site
- requested pickup window
- destination(s)
- product lines
- ordered quantity
- required vehicle/trailer class
- delivery window
- offered/contract rate
- priority
- special handling
- documents
- status

A load order may create one or many trips. A trip may reference exactly one primary load order in the initial design.

Import methods:

- manual entry
- CSV/Excel import
- API
- webhook
- future EDI/ERP connector

## 11. Factory gate and queue management

### 11.1 Gate event model

Create `GateEvent`:

- location/site
- vehicle/trailer
- driver
- trip/load order
- gate direction (`IN`, `OUT`)
- time
- GPS evidence
- QR/RFID/manual verification method
- guard/operator
- photos/documents
- result

### 11.2 Queue

Extend current `DepotQueue` into a site-aware queue:

- loading site
- queue lane/type
- arrival timestamp
- ticket number
- position
- called-to-bay timestamp
- loading bay
- completion timestamp
- waiting reason
- detention eligibility

Queue duration becomes a measured KPI for shipper and transporter performance.

## 12. Weighbridge and axle-load workflow

The current `WeightVerification` model is retained and expanded.

Create `WeighingEvent` with:

- trip
- vehicle combination
- stage (`TARE`, `GROSS`, `AXLE`, `DESTINATION`, `ROAD_CHECK`)
- source (`MANUAL`, `WEIGHBRIDGE_API`, `DOCUMENT_SCAN`)
- gross weight
- tare weight
- net weight
- per-axle/axle-group readings
- legal/configured limits
- variance
- weighbridge name/location
- ticket/certificate number
- image/document
- operator
- timestamp
- pass/fail

### 12.1 Dispatch clearance

Before gate-out the system evaluates:

`vehicle limits + trailer limits + configured legal rule set + commodity/order quantity + axle readings`

An overweight/invalid combination moves the trip to `exception_hold` until corrected or formally overridden under policy.

## 13. Compliance rules engine

Create versioned `ComplianceRuleSet` and `ComplianceRule` models.

Rules can apply by:

- country
- region/corridor
- shipper
- vehicle class
- trailer type
- commodity
- date range

Examples:

- speed threshold
- axle/gross limits
- dimensions
- driver rest interval
- maximum continuous driving
- inspection requirements
- hazardous-goods requirements
- night-driving restrictions where contractually applicable

No legal number should be buried in frontend code.

## 14. Waybill and shipment documents

Upgrade the existing waybill system into `ElectronicWaybill`.

Fields include:

- unique waybill number
- QR verification token
- load order/trip
- shipper
- transporter
- tractor/trailer
- driver
- loading point
- destinations
- product lines
- dispatched quantities
- tare/gross/net weights
- seal number(s)
- departure timestamp
- signatures/approvals
- linked documents
- status

The QR code opens a limited verification page that exposes only appropriate shipment information.

Document versions are immutable after finalization; corrections create superseding versions with an audit trail.

## 15. Telematics architecture

### 15.1 Principle

iFleetPro must be hardware-agnostic.

Current phone GPS, Socket.IO live tracking, `TruckLocation`, geofences and alerts are retained as foundations but moved behind a normalized ingestion layer.

### 15.2 Device registry

Create `TelematicsDevice`:

- deviceId/internal UUID
- IMEI/serial
- vendor
- model
- device type (`GPS`, `MDVR`, `DASHCAM`, `FUEL_SENSOR`, `BLE_SENSOR`, combined)
- SIM ICCID/phone/network where known
- protocol
- firmware
- installed asset type/id
- installation date
- last seen
- battery/power state
- status
- credential reference (never plaintext in repo)

Create `DeviceInstallationHistory` for asset movement.

### 15.3 Provider adapters

Create a provider interface:

- `ingestLocation()`
- `ingestIgnition()`
- `ingestSensor()`
- `ingestAlarm()`
- `requestLiveVideo()` when supported
- `requestPlaybackClip()` when supported
- `healthCheck()`

Adapters may support:

- vendor REST API polling
- vendor webhook
- MQTT
- TCP/UDP tracker gateway
- mobile app

The business layer consumes normalized events and does not know vendor-specific packet formats.

### 15.4 Trusted-source hierarchy

Recommended position confidence order:

1. hardwired certified GNSS tracker
2. integrated MDVR telematics
3. driver phone GPS
4. manual location update

Each location stores source, received time, device time, accuracy and trust level.

### 15.5 Storage model

`LocationEvent`/existing `TruckLocation` is extended with:

- deviceId
- vehicleId
- trailerId where relevant
- tripId
- GPS time
- received time
- latitude/longitude
- speed
- heading
- altitude
- accuracy
- ignition
- odometer
- source
- raw provider event reference

Retention/aggregation policy:

- high-resolution recent data
- compacted historical route points after a configurable period
- trip summary metrics retained long term

## 16. Live control tower

Create a unified `Control Tower` screen.

### 16.1 Map modes

- road map
- terrain where supported
- satellite imagery where supported

Satellite view is a basemap display; it is not a satellite connection to the truck.

### 16.2 Vehicle card

For each active vehicle show:

- tractor/trailer
- driver
- trip/load reference
- shipper/product
- origin/destination
- status
- current speed
- ignition
- last seen
- data source
- GPS health
- ETA
- route deviation
- geofence status
- fuel level where available
- driver-hours status
- active alarms
- camera availability

### 16.3 Control-tower actions

- focus vehicle
- open trip
- contact driver
- open live camera
- request event clip
- replay route
- inspect fuel history
- inspect stop history
- mark/acknowledge alarm
- open exception case

## 17. Geofencing and route intelligence

Extend current `GeofenceZone` to support polygons as well as radius circles.

Geofence types:

- factory
- port
- depot
- yard
- customer
- weighbridge
- fuel station
- workshop
- prohibited zone
- rest stop
- corridor checkpoint

Events:

- enter
- exit
- dwell
- unauthorized visit
- missed required point

Create `PlannedRoute` and `RouteDeviationEvent`.

A trip can have a preferred corridor; deviation tolerance is configurable.

## 18. Video telematics

### 18.1 Camera profiles

Support:

- forward-facing camera
- cabin/driver camera
- rear camera
- side/cargo camera
- multi-channel MDVR

### 18.2 Streaming policy

Continuous cloud streaming is not the default.

Default behavior:

- edge recording on SD/storage
- on-demand live view
- automatically upload event clips around configured incidents
- optionally upload snapshots

Event triggers may include:

- collision/G-sensor
- harsh braking/acceleration
- speeding
- fatigue/DMS alarm
- distraction/phone-use alarm
- route deviation
- panic/SOS
- cargo-door event
- prolonged unauthorized stop
- tracker power tamper

### 18.3 Video security

- RBAC protected
- short-lived signed playback URLs
- audit every live-view/playback action
- retention policy per customer
- privacy notice/driver policy support

## 19. Fuel intelligence

The current fuel logs, fuel prices, fuel stations and budgets remain.

Add telemetry-backed fuel events when hardware exists:

- fuel level samples
- detected refill
- detected drain/drop
- engine-hours fuel consumption
- litres/100 km
- litres/tonne-km where useful
- expected vs actual fuel by route/vehicle/load

Manual fuel entries require receipt/evidence based on company policy.

Fuel anomaly logic compares:

- purchase litres
- tank capacity
- sensor change
- distance
- expected route consumption
- idling
- historical vehicle baseline

An anomaly creates a review case; it does not automatically accuse a driver.

## 20. ePOD and delivery evidence

Create `ProofOfDelivery` per destination.

Evidence can include:

- GPS/geofence verification
- arrival timestamp
- offloading start/end
- dispatched quantity
- received quantity
- damaged quantity
- rejected quantity
- shortage quantity
- receiver name/phone
- receiver PIN/OTP
- QR confirmation
- touchscreen signature
- delivery photos
- document photos
- notes

A quantity discrepancy automatically creates `DeliveryException` with workflow status and financial impact.

Multi-drop trips require an ePOD at every stop.

## 21. Expenses, advances and reconciliation

Existing `CashAdvance`, `FuelLog`, `Expense`, `TollRecord`, `DriverWallet`, `DriverSettlement` and `SettlementLine` remain foundations.

Create `TripReconciliation` with:

- advances issued
- fuel purchases
- tolls/road charges
- loading/offloading fees
- driver allowances
- overnight allowance
- repairs/emergency costs
- fines (subject to policy/approval)
- POD shortages/damages
- receipts/evidence
- expected vs actual totals
- unresolved exceptions
- approval state

A trip cannot reach `reconciled` while blocking financial exceptions remain.

## 22. Haulier/owner settlement

Create `HaulierSettlement` and lines for third-party transporters/vehicle owners.

Settlement can calculate:

- contracted trip revenue
- tonnage/bag/pallet rate
- detention/waiting charges
- fuel adjustments
- approved extras
- shortage/damage deductions
- penalties
- taxes/withholding
- advances already paid
- net payable

This is separate from driver payroll/settlement.

## 23. Billing and profitability

Per trip calculate:

- gross customer revenue
- haulier cost
- fuel cost
- driver cost
- tolls/fees
- maintenance allocation if configured
- other direct expenses
- shortage/damage impact
- gross contribution/margin

Dashboard KPIs include:

- revenue per truck
- margin per trip/route/customer
- cost per km
- fuel cost per km
- revenue per tonne
- vehicle utilization
- empty return kilometres
- factory waiting time
- customer offloading time
- on-time delivery
- POD exception rate

## 24. AI operations layer

AI features are advisory unless explicitly configured otherwise.

### 24.1 Phase 1 deterministic intelligence

- threshold alerts
- expected-vs-actual fuel
- route deviation
- excessive dwell
- ETA using current progress and historical travel time
- compliance risk scoring
- document expiry risk

### 24.2 Phase 2 statistical/ML intelligence

After enough trusted data is collected:

- fuel anomaly detection
- predicted breakdown/maintenance risk
- tyre risk
- driver safety score
- factory queue/wait prediction
- late-delivery prediction
- optimal truck/driver assignment
- expected trip margin
- suspicious trip/expense pattern detection

### 24.3 AI assignment recommendation

The recommendation engine may rank eligible combinations using:

- location/deadhead distance
- vehicle/trailer suitability
- maintenance health
- compliance status
- driver hours
- route experience
- historical fuel efficiency
- on-time history
- customer/shipper restrictions
- projected margin

Final dispatch authorization remains human-controlled initially.

## 25. Integration architecture

### 25.1 External integration types

- shipper/factory API
- CSV/Excel imports
- webhook ingestion
- telematics vendor API
- SMS provider
- email
- payment/mobile-money provider
- mapping/routing provider
- optional government/industry APIs when legally and technically available

### 25.2 Integration credentials

All credentials live in server secret/environment storage, never tracked source files or client bundles.

Create `IntegrationConnection` metadata that stores non-secret configuration and a secret reference.

## 26. API/domain boundaries

Recommended domain modules:

- `orders`
- `dispatch`
- `fleet-assets`
- `trailers`
- `drivers`
- `factory-ops`
- `weighing`
- `waybills`
- `telematics`
- `video-telematics`
- `routing`
- `delivery`
- `fuel`
- `expenses`
- `reconciliation`
- `settlements`
- `billing`
- `compliance`
- `ai-ops`

Controllers/routes call domain services. Business rules do not live primarily in React components.

## 27. Event model

Use durable operational events for major actions.

Examples:

- `load_order.created`
- `trip.assigned`
- `trip.eligibility_passed`
- `gate.entered`
- `queue.joined`
- `weighing.recorded`
- `loading.completed`
- `waybill.finalized`
- `trip.departed`
- `vehicle.position_received`
- `geofence.entered`
- `route.deviation_detected`
- `video.alarm_received`
- `delivery.pod_completed`
- `delivery.exception_created`
- `trip.reconciled`
- `haulier_settlement.approved`

Initially these can persist synchronously in the main database. A dedicated message broker is not required until volume justifies it.

## 28. Offline/mobile behavior

Driver workflows must tolerate weak mobile data.

The driver/mobile web app should queue locally:

- trip status updates
- inspection answers
- photos
- receipts
- POD evidence
- GPS samples where appropriate

Uploads retry when connectivity returns. Server conflict rules prefer immutable event history over destructive overwrite.

Hardwired GPS/MDVR devices continue independently of the driver app.

## 29. Security architecture

### 29.1 Immediate Phase 0 requirement

The repository contains historical operational documentation that appears to expose production infrastructure/database/webhook secrets. Treat exposed credentials as compromised.

Before major production expansion:

- rotate database credentials
- rotate webhook/deployment secrets
- inspect for other committed credentials
- remove secrets from tracked documentation and, where practical, history
- close unnecessary public database/network exposure
- create separate development/staging database access
- prohibit local development from using production DB by default
- move credentials to server secret/environment management

### 29.2 Device security

Hardware ingestion must not use ordinary human-session authentication.

Use one of:

- vendor-signed webhook validation
- per-device or per-provider credentials
- HMAC signatures
- mTLS where supported
- authenticated MQTT
- controlled TCP gateway mapping IMEI to device registry

Reject unknown/unregistered devices unless a controlled provisioning workflow is active.

### 29.3 Audit

Record sensitive actions including:

- assignment/dispatch overrides
- compliance overrides
- weight overrides
- waybill corrections
- POD corrections
- financial approvals
- settlement changes
- live-camera access
- integration credential/config changes

## 30. Data migration strategy

The redesign must avoid destructive resets.

1. Add new tables/columns first.
2. Keep current `Truck`, `Trip`, `TripDeliveryDestination`, `TruckLocation`, `WeightVerification`, `FuelLog`, `DriverSettlement` working.
3. Backfill transporter/ownership for current fleet.
4. Map current trucks to vehicle assets.
5. Create trailers only for known articulated combinations.
6. Map current zone rates into the new rate-card structure while preserving old reads.
7. Introduce domain services and dual-read/dual-write only where necessary.
8. Migrate screens progressively.
9. Remove legacy fields only after usage is proven zero.

## 31. Main user interfaces

### 31.1 Operations Dashboard

- trucks active/inactive/maintenance
- active loads
- at factory
- in queue
- loading
- in transit
- delivering
- delayed/exception
- today's tonnage/trips
- outstanding POD
- trips awaiting reconciliation

### 31.2 Dispatch Board

Kanban/table hybrid grouped by operational status with drag actions only when transitions are legal.

### 31.3 Control Tower

Full-screen map plus fleet panel, alarm feed and selected-vehicle drawer.

### 31.4 Factory Operations

- gate queue
- scheduled loads
- bay status
- weighings
- loading progress
- clearance holds

### 31.5 Trip Workspace

One timeline combining commercial, operational, telemetry, delivery and financial evidence.

### 31.6 Driver App

Large-action, low-distraction UI:

- today's assignment
- navigation link
- gate/queue status
- pre-trip inspection
- expense/fuel submission
- issue/SOS reporting
- delivery/POD
- offline sync status

## 32. Reporting

Required report families:

- trip operations
- vehicle utilization
- route performance
- shipper/customer performance
- loading-point waiting time
- driver performance/safety
- fuel efficiency/anomalies
- maintenance/availability
- compliance expiries
- weight/overload history
- delivery/POD exceptions
- revenue/cost/margin
- haulier settlement
- driver settlement
- telematics uptime/device health

## 33. Testing strategy

### 33.1 Unit tests

- state transition guards
- eligibility rules
- weight calculations
- rate calculation
- reconciliation
- settlement
- geofence calculations
- route deviation
- provider normalization

### 33.2 Contract tests

Each telematics provider adapter must pass a common event-normalization test suite.

### 33.3 Integration tests

End-to-end flows:

1. order -> trip -> assignment
2. eligibility -> gate -> queue -> loading
3. tare/gross -> clearance
4. telemetry -> control tower -> alerts
5. delivery -> POD -> exception
6. reconciliation -> driver settlement -> haulier settlement -> invoice

### 33.4 UAT scenarios

At minimum simulate:

- cement single-drop delivery
- cement multi-drop delivery
- FMCG multi-stop delivery
- third-party haulier trip
- overweight load correction
- expired driver/truck document block
- tracker offline and phone fallback
- route deviation
- fuel anomaly
- damaged/short delivery
- offline driver POD synchronization

## 34. Implementation phases

### Phase 0 — Security and platform hardening

- rotate exposed credentials
- isolate production DB
- secret handling
- harden deployment and device ingestion
- baseline regression tests

### Phase 1 — Ghana haulage domain foundation

- organisation/transporter/owner
- tractor/trailer separation
- load orders
- shipper/factory profiles
- rate cards/contracts
- guarded trip lifecycle

### Phase 2 — Factory loading and compliance

- gate events
- queue/bay workflow
- weighing/axle workflow
- dispatch clearance
- electronic waybill
- compliance rule engine

### Phase 3 — Telematics control tower

- device registry
- provider adapter interface
- normalized ingestion
- persistent real-time pipeline
- control tower
- route replay/deviation
- device health

### Phase 4 — Delivery and financial closure

- ePOD
- shortages/damages
- reconciliation
- driver settlement improvements
- haulier settlement
- trip profitability

### Phase 5 — Video telematics

- MDVR/dashcam registry
- on-demand video
- event clips
- ADAS/DMS alarm normalization

### Phase 6 — AI operations

- deterministic recommendations first
- historical baselines
- anomaly models
- ETA/queue prediction
- assignment recommendation
- predictive maintenance/risk

## 35. Acceptance criteria for the complete platform

A transporter can configure a shipper/loading point, receive or enter a load order, assign an eligible driver + tractor + trailer, process loading/weighing/waybill clearance, track the vehicle live, receive exceptions, complete verified POD, reconcile trip costs, settle both driver and subcontracted haulier, invoice the customer and inspect real trip margin without re-entering the same operational information in separate modules.

The same platform must work when:

- only driver-phone GPS exists,
- a professional hardwired tracker is installed,
- a multi-channel MDVR is installed,
- the vehicle belongs to a subcontractor,
- connectivity is temporarily unavailable,
- one trip has several delivery destinations.

## 36. Key architectural decisions

1. **Hardware-agnostic hybrid telematics** is the selected approach.
2. **Tractor and trailer are separate assets.**
3. **Load order is separate from trip.**
4. **Factory/shipper behavior is configuration, not hard-coded brands.**
5. **Compliance is versioned rules, not frontend constants.**
6. **Phone GPS remains a fallback.**
7. **Satellite imagery is a map option; satellite connectivity is optional backup only.**
8. **Video is on-demand/event-driven by default, not continuous cloud streaming.**
9. **Operational events and evidence are append-oriented and auditable.**
10. **AI starts as advisory and is trained only on sufficiently trustworthy operational data.**
11. **Migration is incremental; no database reset is required.**
12. **Security remediation is Phase 0 and blocks unsafe production expansion.**

## 37. Research basis

The design reflects public Ghana transport/cargo practices and regulatory/industry material reviewed during product research, including:

- Ghana Shippers' Authority material on JAPTU driver/vehicle registration, verification and transit shipment tracking.
- Ghana Ports and Harbours Authority truck/trailer access and identification practices at Tema Port.
- Ghana Shippers' Authority material on Truck Loading Advice at Takoradi Port.
- Ghana Highway Authority axle-load/weighbridge operating procedures.
- Ministry of Transport current road-traffic regulatory changes and commercial transport compliance requirements.
- Ghana-local fleet-tracking offerings demonstrating practical GNSS + mobile-data + geofencing deployment.
- Public factory/depot/product information from major Ghanaian industrial shippers.

Factory-specific proprietary SOPs remain configurable and must be validated with each shipper/customer during onboarding.

---

## Spec self-review

- No implementation-critical TBD placeholders remain.
- The selected telematics architecture is consistent across device registry, ingestion and UI.
- Tractor/trailer separation is carried through assignment, weighing, waybill and settlement.
- Factory-specific rules remain configurable instead of brand-coded.
- Current iFleetPro modules are extended incrementally rather than replaced destructively.
- Security remediation is explicit and precedes production expansion.
- Scope is large but intentionally split into independently implementable phases that share one stable domain design.
