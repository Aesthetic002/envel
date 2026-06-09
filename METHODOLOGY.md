# AgriSpectra — Methodology & Scientific Basis

A complete explanation of the science, mathematics, and analytical methods behind
AgriSpectra's crop health monitoring. This document covers **what is measured, how
it is calculated, and why the methods are valid** — no source code, only the
underlying reasoning.

---

## Table of Contents

1. [Overview & Philosophy](#1-overview--philosophy)
2. [The Three Data Streams](#2-the-three-data-streams)
3. [Image Analysis — Vegetation Greenness (VARI)](#3-image-analysis--vegetation-greenness-vari)
4. [Atmospheric Demand — Vapor Pressure Deficit (VPD)](#4-atmospheric-demand--vapor-pressure-deficit-vpd)
5. [Stress Scoring — The Comfort-Band Model](#5-stress-scoring--the-comfort-band-model)
6. [The Crop Health Index (CHI) — Sensor Fusion](#6-the-crop-health-index-chi--sensor-fusion)
7. [Recommendation Engine](#7-recommendation-engine)
8. [Disease Diagnosis — Vision-Based Pathology](#8-disease-diagnosis--vision-based-pathology)
9. [Worked Example (End to End)](#9-worked-example-end-to-end)
10. [Assumptions, Limitations & Calibration](#10-assumptions-limitations--calibration)
11. [Glossary of Terms](#11-glossary-of-terms)

---

## 1. Overview & Philosophy

Traditional precision agriculture relies on expensive, physically-deployed sensors:
soil moisture probes, multispectral drones, in-field weather stations. AgriSpectra
asks a different question:

> **How much crop-health insight can we extract using only an ordinary smartphone
> photo and freely available weather data?**

The answer is: a surprising amount, *if* the right scientific proxies are used. The
system rests on three pillars:

| Pillar | What it tells us | Source |
|---|---|---|
| **Leaf greenness** | Current visible plant vigor | Phone/camera photo |
| **Atmospheric demand** | How hard the air is "pulling" water from the plant | Live weather API |
| **Water availability** | Whether the soil can meet that demand | Field estimate / probe |

The core idea is **sensor fusion**: no single number tells the whole story, but
combining several weak-but-cheap signals produces a robust overall verdict. A plant
can *look* green yet be on the verge of heat-and-drought stress; conversely, a
slightly yellow leaf in perfect weather may just be old. By fusing the visual signal
with the environmental signals, the system catches stress **before** it becomes
visually obvious, and avoids false alarms from any single misleading input.

---

## 2. The Three Data Streams

### 2.1 Visual stream (the leaf image)
A close-up photograph of crop foliage. Each pixel's red, green, and blue values are
analysed to estimate vegetation vigor (see Section 3).

### 2.2 Atmospheric stream (live weather)
Pulled from the **Open-Meteo API** (free, no key, no sensors). For a chosen location
the system retrieves:
- **Air temperature** (°C)
- **Relative humidity** (%)
- **Recent precipitation** (mm)

From temperature and humidity it derives **Vapor Pressure Deficit** (Section 4).

### 2.3 Soil stream (water availability)
Soil moisture is **not** available from any free weather API and cannot be inferred
reliably from the air. It is therefore provided manually — as a percentage — either
read from a field probe or estimated from recent rainfall and irrigation. This is an
honest design choice: rather than fabricate a soil value, the system makes the
assumption explicit and lets the user set it.

---

## 3. Image Analysis — Vegetation Greenness (VARI)

### 3.1 The problem with "true" NDVI
The agricultural gold standard for plant vigor is **NDVI** (Normalized Difference
Vegetation Index):

```
NDVI = (NIR − Red) / (NIR + Red)
```

NDVI requires a **near-infrared (NIR)** band, because healthy chlorophyll-rich
leaves reflect strongly in NIR while stressed leaves do not. The problem: **ordinary
phone cameras do not capture NIR.** They only record visible Red, Green, and Blue.

### 3.2 The solution: VARI
AgriSpectra uses the **Visible Atmospherically Resistant Index (VARI)** — a
well-established proxy from the precision-agriculture literature that estimates
greenness using *only* the visible bands:

```
VARI = (Green − Red) / (Green + Red − Blue)
```

**Why this works:**
- Healthy vegetation reflects **green** light strongly and absorbs **red** light
  (chlorophyll absorbs red for photosynthesis). So a vigorous leaf has *high green,
  low red* → a **large positive** VARI.
- Stressed, yellowing, or senescing leaves reflect **more red** as chlorophyll
  breaks down → green and red converge → VARI **drops toward zero or negative**.
- The **− Blue** term in the denominator provides *atmospheric resistance*: haze and
  scattered light contaminate the blue channel most, so subtracting blue cancels much
  of the lighting/atmospheric noise. This is what makes VARI more robust than a naive
  green-minus-red index.

The result is **clamped to the range [−1, +1]** for stability.

### 3.3 Separating plant from background
Not every pixel is a leaf — there may be soil, sky, hands, or shadow. A pixel is
classified as **vegetation** only if green genuinely dominates:

```
vegetation  ⟺  Green > Red   AND   Green > 0.9 × Blue
```

The `0.9 × Blue` factor allows for slightly bluish lighting while still rejecting
sky and grey background. All subsequent statistics are computed **only over
vegetation pixels**, so a photo that is 50% soil doesn't dilute the leaf reading —
instead, the system reports a low **vegetation cover %** to flag that the framing was
poor.

### 3.4 From per-pixel VARI to a health map
Each vegetation pixel is sorted into one of three health classes by its VARI value:

| Class | VARI range | Interpretation | Map tint |
|---|---|---|---|
| **Healthy** | VARI ≥ 0.15 | Vigorous, chlorophyll-rich | 🟢 Green |
| **Mild stress** | 0.02 ≤ VARI < 0.15 | Early yellowing / fading | 🟡 Yellow |
| **Stressed** | VARI < 0.02 | Senescent / chlorotic / damaged | 🔴 Red |

The original photo is then re-tinted pixel-by-pixel (a 40% original + 60% tint blend)
to produce the **color-coded stress map** — an at-a-glance spatial picture of where
on the leaf/canopy the problems are.

### 3.5 Summary statistics produced
- **Healthy %, Mild %, Stressed %** — the share of vegetation area in each class.
- **Vegetation cover %** — what fraction of the whole image was actually plant
  (a framing-quality indicator).
- **Mean VARI (greenness)** — the average VARI over all vegetation pixels. This
  single number is what feeds into the Crop Health Index.

> **Performance note:** large images are downscaled (longest side capped at 900 px)
> before analysis. This keeps the per-pixel computation fast and memory-light without
> materially changing the statistics, since greenness is an *average* property.

---

## 4. Atmospheric Demand — Vapor Pressure Deficit (VPD)

### 4.1 What VPD is
**Vapor Pressure Deficit** is the difference between how much moisture the air
*could* hold (at saturation) and how much it *currently* holds. It is the single best
measure of the "drying power" of the atmosphere — the force pulling water out of a
plant's leaves through transpiration.

- **Low VPD** → humid, gentle air → little transpiration stress.
- **High VPD** → hot, dry air → the plant loses water rapidly and, if the soil can't
  resupply fast enough, the stomata close, photosynthesis halts, and stress sets in.

VPD is more physiologically meaningful than temperature or humidity *alone*, because
it captures their **combined** effect — 30 °C at 80% humidity is mild, but 30 °C at
30% humidity is punishing, and only VPD distinguishes the two.

### 4.2 Step 1 — Saturation Vapor Pressure (Tetens equation)
First we compute how much water vapor the air can hold at the current temperature,
using the **Tetens equation**, a standard empirical formula in agronomy and
meteorology:

```
SVP(T) = 0.6108 × exp( 17.27 × T / (T + 237.3) )      [kPa]
```

where **T** is air temperature in °C. SVP rises steeply (exponentially) with
temperature — warm air can hold dramatically more moisture than cool air.

### 4.3 Step 2 — Deficit from relative humidity
Relative humidity tells us what *fraction* of that saturation capacity is currently
filled. The deficit is therefore:

```
VPD = SVP(T) × (1 − RH/100)      [kPa]
```

- At **100% RH**, VPD = 0 (air is saturated, no drying power).
- As RH falls, VPD climbs toward the full SVP value.

The result is expressed in **kilopascals (kPa)**, the conventional unit for VPD.

### 4.4 Comfort range used
Most crops transpire comfortably in the band **0.4 – 1.6 kPa**. Below ~0.4 kPa the
air is so humid that transpiration (and nutrient uptake) slows and disease pressure
rises; above ~1.6 kPa the drying demand starts to outpace what roots can supply.

---

## 5. Stress Scoring — The Comfort-Band Model

Every environmental input is converted to a **stress score on a 0 → 1 scale**, where
**0 = perfectly comfortable** and **1 = maximally stressed**. This common scale is
what makes the later fusion possible (Section 6).

### 5.1 The piecewise model
Each variable has an **optimal band** `[low, high]`. Inside the band there is no
stress; outside it, stress grows linearly with distance from the nearest edge:

```
                     ⎧  clip( (low − x) / low , 0, 1 )      if x < low   (too low)
stress(x) =          ⎨  0                                    if low ≤ x ≤ high (ideal)
                     ⎩  clip( (x − high) / high , 0, 1 )    if x > high  (too high)
```

- The distance from the band edge is **normalised by the edge value**, so the score
  is dimensionless and comparable across variables with different units.
- `clip(·, 0, 1)` caps the score so it never exceeds 1, no matter how extreme the
  input.

This shape encodes a key agronomic truth: **there is a range of "good enough," and
harm accelerates the further you stray from it** — in *either* direction (both
drought *and* waterlogging are bad; both cold *and* heat are bad).

### 5.2 The comfort bands

| Variable | Optimal band | Reasoning |
|---|---|---|
| **Temperature** | 18 – 32 °C | The active-growth comfort zone for most field crops. Below 18 °C growth slows; above 32 °C heat stress and respiration losses mount. |
| **VPD** | 0.4 – 1.6 kPa | See Section 4.4 — the balanced transpiration window. |
| **Soil moisture** | 35 – 85 % | Below ~35% the plant struggles to extract water; above ~85% roots are starved of oxygen (waterlogging). |
| **Greenness (VARI)** | ≥ 0.25 (one-sided) | Treated as a *deficiency* signal: greenness below 0.25 contributes stress proportional to the shortfall, `(0.25 − VARI) / 0.25`. Above 0.25, no stress. |

---

## 6. The Crop Health Index (CHI) — Sensor Fusion

### 6.1 The fusion principle
The individual stress scores are combined into **one number from 0 to 100** — the
**Crop Health Index** — via a **weighted sum**. Weights reflect each factor's relative
importance to crop survival.

```
total_stress = Σ ( weightᵢ × stress_scoreᵢ )

CHI = 100 × (1 − total_stress)
```

Because every stress score is in [0, 1] and the weights sum to 1, `total_stress` is
also in [0, 1], so **CHI always lands cleanly between 0 and 100**. A CHI of 100 means
*every* factor is inside its comfort band; 0 means *every* factor is maximally
stressed.

### 6.2 The two weighting schemes

**Without a leaf image** (environment-only):

| Factor | Weight |
|---|---|
| Soil moisture | **0.40** |
| VPD | **0.35** |
| Temperature | **0.25** |

Soil and VPD dominate because the water-supply-vs-water-demand balance is the primary
driver of acute crop stress; temperature contributes both directly and *through* VPD.

**With a leaf image** (greenness folded in):

| Factor | Weight |
|---|---|
| Soil moisture | **0.30** |
| VPD | **0.28** |
| Temperature | **0.17** |
| Greenness | **0.25** |

When real visual evidence is available it earns a substantial 25% share, and the
environmental weights are scaled down proportionally so the total still sums to 1.
This means the image acts as an independent **cross-check**: if the weather looks fine
but the leaf is visibly chlorotic, the CHI correctly drops.

### 6.3 Health categories
The continuous score is bucketed into three plain-language verdicts:

| CHI range | Category | Meaning |
|---|---|---|
| **70 – 100** | 🟢 **Healthy** | Conditions within tolerances; maintain routine. |
| **45 – 70** | 🟡 **Moderately Stressed** | One or more factors drifting; intervention advisable. |
| **0 – 45** | 🔴 **Critically Stressed** | Multiple/severe stresses; act within ~24h. |

---

## 7. Recommendation Engine

The system translates the numeric scores into **specific, actionable advice** using a
transparent rule set (not a black box). Each rule fires only when its trigger is met:

| Trigger | Advice given |
|---|---|
| Soil stress > 0.2 **and** moisture < 35% | 💧 Irrigate today — soil below comfort band. |
| Soil stress > 0.2 (but ≥ 35%) | 💧 Soil trending low — keep irrigation on standby. |
| VPD stress > 0.2 **or** VPD > 1.6 kPa | 🌡️ High atmospheric demand — irrigate in cooler hours, consider shade/mulch. |
| Temp stress > 0.2 **and** temp > 32 °C | 🔥 Heat-stress risk — avoid mid-day spraying, water before peak heat. |
| Temp stress > 0.2 **and** temp < 18 °C | ❄️ Cool conditions slowing growth — delay heavy fertilisation. |
| Image shows > 20% stressed leaf area | 🍂 Inspect those zones for pests/disease; consider targeted (not field-wide) treatment. |
| Greenness stress > 0.3 | 🧪 Possible nutrient deficiency — check nitrogen. |
| No triggers fire | ✅ Conditions healthy — maintain current schedule. |
| Category = Critically Stressed | 🚨 Prepended critical alert — overlapping stresses, act within 24h. |

Because the rules are threshold-based and explainable, a user can always see **why**
a given recommendation appeared — there is no opaque model making unaccountable
decisions.

### 7.1 The AI assistant layer
On top of the rule engine, an AI assistant (a large language model) is given the
**current readings as context** and answers free-form questions in plain language.
Crucially, it is constrained to refer only to the user's actual numbers — it
personalises advice ("your soil is at 42%…") rather than giving generic textbook
responses, and it never invents data it wasn't given.

---

## 8. Disease Diagnosis — Vision-Based Pathology

When a leaf shows meaningful stress, AgriSpectra offers an **optional, deeper layer**:
a probable disease diagnosis with a full scientific treatment plan. This section
explains *why it is a separate method from the greenness analysis* and how it stays
scientifically honest.

### 8.1 Why greenness alone cannot diagnose disease
The VARI analysis (Section 3) measures *how green* a leaf is — a single scalar of
vigor. But greenness is a **symptom, not a cause**. A yellow patch could be:

- **Nitrogen deficiency** (a nutrient problem),
- **Drought or heat stress** (an abiotic/water problem), or
- **Fungal, bacterial, or viral infection** (a pathogen).

VARI sees "less green" in *all* of these and cannot tell them apart. Diagnosing the
actual cause requires recognising **visual patterns** — the shape, distribution, and
texture of symptoms — which a single averaged number simply does not contain.

### 8.2 The method: multimodal vision analysis
Diagnosis is therefore performed by a **vision-capable large language model**
(GPT-4o, accessed through the same GitHub Models endpoint). The model receives **two
things together**:

1. **The leaf image itself** — so it can read the *visual signature* of the problem:
   - **Spots / lesions** with defined margins → typical of fungal/bacterial disease
   - **Mosaic / mottling** patterns → typical of viral infection
   - **Powdery or downy coating** → mildews
   - **Uniform yellowing** (especially older leaves first) → often nutrient/abiotic
   - **Leaf-edge browning / scorch** → often heat or salinity stress
2. **The environmental context** — the same CHI, VPD, soil moisture, temperature,
   and VARI statistics computed earlier.

### 8.3 The critical step: biotic-vs-abiotic cross-referencing
The single most important reasoning the model is instructed to perform is to **fuse
the visual and environmental evidence** before naming a cause. For example:

> *Uniform yellowing + low soil moisture + high VPD* → the environment already
> explains the symptom, so the probable cause is **water/nutrient stress, not
> infection** — and the model is told to say so rather than reflexively naming a
> disease.

> *Distinct dark lesions with concentric rings, despite healthy soil and mild
> weather* → the environment does **not** explain it, pointing to a **pathogen**
> (e.g. early/late blight).

This is the same sensor-fusion philosophy as the CHI, applied to diagnosis: a
conclusion is only trusted when *both* channels agree, which sharply reduces false
disease calls.

### 8.4 Structured, scientific output
The model is constrained to return a structured result with these fields:

| Field | Content |
|---|---|
| **Probable disease** | The most likely disorder — or "Healthy" / "Inconclusive". |
| **Confidence** | High / Medium / Low — honest about a single-photo limitation. |
| **Severity** | None / Mild / Moderate / Severe. |
| **Summary** | What is seen and the likely cause, in plain language. |
| **Also consider** | A differential — other conditions to rule out. |
| **Irrigation** | Specific water adjustment (more/less, timing). |
| **Soil** | Compounds to add or avoid, pH guidance. |
| **Fertiliser** | Type, **NPK ratio**, and approximate **dosage** (per plant / per ha). |
| **Treatment** | A named chemical control **and** an organic/cultural alternative. |
| **Prevention** | Practices to stop recurrence. |
| **Caveat** | A mandatory safety reminder (always present). |

### 8.5 When it runs (and when it doesn't)
The diagnosis is **not** run on every photo. It is offered only when the image shows
**genuine stress** — specifically when the stressed leaf area exceeds ~15%, mild
stress exceeds ~30%, or the CHI category is not "Healthy". A clearly healthy leaf is
left alone, so the tool never **invents** a disease where none is visible. When the
image is too blurry, dark, or ambiguous to judge, the model returns
**"Inconclusive"** with low confidence rather than guessing.

### 8.6 Safety framing — diagnosis as decision-support
Naming a disease can lead a farmer to apply chemicals, so the design treats every
result as **probable decision-support, never a verdict**:

- Each diagnosis carries an explicit **confidence level**.
- A **caveat is always shown** — and is force-inserted by the system even if the
  model omits it — reminding the user to **confirm with a local agronomist or plant
  clinic before applying chemicals**.
- The model is instructed never to recommend a dangerous dose and to keep all advice
  within standard agronomic ranges.

This framing is deliberate: a confidently-stated *wrong* diagnosis is more harmful
than an honest "uncertain — here's what to rule out," especially when crop chemicals
and yield are at stake.

---

## 9. Worked Example (End to End)

Suppose a user in **Bengaluru** uploads a healthy green tomato leaf, and the live
weather returns **22.4 °C, 87% humidity**, with soil set to **50%**.

**Step 1 — Image analysis**
The leaf is vibrant: mean VARI ≈ **0.49**, with ~100% of vegetation pixels classed
healthy (VARI ≥ 0.15). Vegetation cover ≈ 100% (good framing).

**Step 2 — VPD**
```
SVP(22.4) = 0.6108 × exp(17.27 × 22.4 / (22.4 + 237.3)) ≈ 2.71 kPa
VPD       = 2.71 × (1 − 87/100)                          ≈ 0.35 kPa
```

**Step 3 — Stress scores**
- Temperature 22.4 °C is inside 18–32 → **temp stress = 0**
- VPD 0.35 kPa is just below the 0.4 floor → tiny stress ≈ **0.12**
- Soil 50% is inside 35–85 → **soil stress = 0**
- Greenness 0.49 is above 0.25 → **green stress = 0**

**Step 4 — CHI (image present, so 4-factor weights)**
```
total_stress = 0.30×0   + 0.28×0.12 + 0.17×0 + 0.25×0
             ≈ 0.034
CHI = 100 × (1 − 0.034) ≈ 96.7
```

**Result:** **CHI ≈ 96.7 / 100 → Healthy 🟢.** The only flagged factor is a slightly
low VPD (very humid air), which is benign. Recommendation: *"Conditions within
healthy bands — maintain current schedule."* This matches intuition: a lush leaf in
mild, humid weather is a happy plant.

---

## 10. Assumptions, Limitations & Calibration

A scientifically honest tool states its boundaries clearly.

### 10.1 Known limitations
- **VARI is a proxy, not true NDVI.** It tracks greenness well but cannot see the
  NIR "red-edge" collapse that reveals stress *before* visible yellowing. It is a
  strong indicator, not a laboratory measurement.
- **Lighting affects color.** Harsh direct sun, deep shade, or strongly tinted
  artificial light shift RGB values. Diffuse daylight gives the most reliable VARI.
  (The − Blue term mitigates but does not eliminate this.)
- **Soil moisture is user-supplied.** Its accuracy depends entirely on the quality of
  the field estimate or probe. A wrong soil figure will skew the CHI, since soil
  carries the largest weight.
- **Weather is point-forecast, not in-field.** Open-Meteo gives gridded regional
  weather, which may differ from a specific microclimate (a sheltered valley, a
  greenhouse, an urban heat pocket).
- **Bands are general-purpose.** The comfort ranges (temp 18–32, VPD 0.4–1.6, soil
  35–85) suit a *typical* field crop. They are not tuned to any single species.

### 10.2 Calibration for production use
The thresholds and weights are **deliberately exposed and documented** so they can be
tuned per crop and region:
- **Rice** tolerates (indeed prefers) higher soil moisture / waterlogged conditions —
  its soil band should shift upward.
- **Cool-season crops** (lettuce, peas) want a lower temperature band.
- **Greenhouse operations** can tighten VPD bands and rely less on the weather API.
- Weights can be re-balanced if, say, a grower trusts their soil probe more than the
  regional forecast.

The methodology is the framework; the numbers are starting points, not dogma.

---

## 11. Glossary of Terms

| Term | Definition |
|---|---|
| **NDVI** | Normalized Difference Vegetation Index — the standard satellite/drone vigor measure; requires a near-infrared band. |
| **NIR** | Near-Infrared light — invisible band that healthy vegetation reflects strongly; not captured by ordinary cameras. |
| **VARI** | Visible Atmospherically Resistant Index — the RGB-only greenness proxy used here. |
| **VPD** | Vapor Pressure Deficit — the drying power of the air, in kPa. |
| **SVP** | Saturation Vapor Pressure — the maximum water vapor air can hold at a given temperature. |
| **Tetens equation** | The empirical formula relating temperature to saturation vapor pressure. |
| **Stress score** | A 0–1 value (0 comfortable, 1 maximally stressed) for one variable. |
| **Sensor fusion** | Combining multiple independent signals into a single, more reliable verdict. |
| **CHI** | Crop Health Index — the fused 0–100 overall health score. |
| **Comfort band** | The `[low, high]` range of a variable within which the crop is unstressed. |
| **Vegetation cover** | The fraction of an image's pixels identified as plant material. |
| **Transpiration** | The plant's loss of water vapor through leaf stomata — driven by VPD. |
| **Chlorophyll** | The green pigment that absorbs red light for photosynthesis; its loss causes yellowing (chlorosis). |
| **Senescence** | The natural aging/dying of plant tissue, marked by declining greenness. |
| **Biotic stress** | Harm caused by living agents — fungi, bacteria, viruses, insects. |
| **Abiotic stress** | Harm caused by non-living factors — drought, heat, cold, nutrient deficiency, salinity. |
| **Differential diagnosis** | The set of alternative conditions worth ruling out before settling on one. |
| **NPK ratio** | The proportion of Nitrogen, Phosphorus, and Potassium in a fertiliser (e.g. 19-19-19). |
| **Multimodal model** | An AI model that accepts more than one input type at once — here, image + text. |

---

*AgriSpectra — turning an ordinary photo and a weather feed into actionable crop
intelligence, with every step open to inspection.*
