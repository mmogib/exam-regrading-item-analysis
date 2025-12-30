## Notation (used throughout)

- $(k = 20)$: number of items.
- $(N)$: number of students.
- Item index $(i = 1,\dots,k)$.
- Option index $(j = 1,\dots,5)$.
- $(n\_{ij})$: number of students selecting option $(j)$ for item $(i)$.
- Correct option for item $(i)$ is $(j^*(i))$.
- $(n*{i,c}=n*{i,j^*(i)})$: # correct for item $(i)$.
- Total score for student $(s)$: $(T*s = \sum*{i=1}^k X*{is})$, where $(X*{is}=1)$ if correct, else 0.
- Use **rest score** for item $(i)$: $(T^{(-i)}_s = T_s - X_{is})$ (recommended for correlations).

---

# A. Item difficulty (p-value)

### Method

Compute the proportion of students answering the item correctly.

### Formula

$$
p_i = \frac{n_{i,c}}{N}
$$

### Interpretation

- (p_i) near **1**: easy; near **0**: hard.
- Common operational targets:

  - **Good working range**: $(0.30 \le p_i \le 0.80)$
  - **Too difficult**: $(p_i < 0.30)$
  - **Too easy**: $(p_i > 0.80)$

For **5 options**, random-guess baseline is (1/5=0.20). If (p_i) is close to 0.20, the item may be near “guess-level” (or the content was not learned).

---

# B. Option proportions (distractor popularity)

### Method

For each option, compute how many students chose it.

### Formula

$$
p_{ij} = \frac{n_{ij}}{N}, \quad j=1,\dots,5
$$

### Interpretation

- The **correct option** should typically be the modal choice (largest $(p_{ij})$).
- Each distractor should be “plausible” and attract some students.
- Rule-of-thumb for distractor functioning:

  - **Functional distractor**: ($p_{ij} \ge 0.05$) (≥ $5%$ choose it)
  - **Non-functional distractor (NFD)**: $(p\_{ij} < 0.05)$

- If two or more distractors are NFDs, the item often becomes too easy or poorly constructed.

---

# C. Distractor efficiency (DE)

### Method

Summarize how many distractors function for each item.

With 5 options, there are **4 distractors**.

### Formula

$$
\text{DE} = \frac{\{j \neq j^*(i): p_{ij} \ge 0.05\}}{4}\times 100%
$$

### Interpretation

- **DE = 100%**: all 4 distractors functioning.
- **DE = 75%**: 3 functioning, 1 NFD.
- **DE ≤ 50%**: weak item (2 or fewer functioning distractors), typically revise.

---

# D. Upper–Lower discrimination index (item level)

### Method

Split students into high- and low-performing groups using total score (usually top and bottom 27%). Compare correct-response rates between groups.

Let:

- (N_U, N_L): sizes of upper and lower groups.
- (U\_{i,c}): # in upper group correct on item (i).
- (L\_{i,c}): # in lower group correct on item (i).

### Formula

[
D_i = \frac{U_{i,c}}{N_U} - \frac{L_{i,c}}{N_L}
]

### Interpretation (common cutoffs)

- (D_i \ge 0.40): very good discrimination
- (0.30 \le D_i < 0.40): good
- (0.20 \le D_i < 0.30): acceptable
- (0.00 \le D_i < 0.20): weak (review)
- (D_i < 0): problematic (possible wrong key, ambiguity, misalignment)

Note: (D_i) tends to be small when (p_i) is extremely high or low.

---

# E. Upper–Lower option discrimination (distractor-level)

### Method

For each option (j), compare how often upper vs. lower students choose it.

Let:

- (U\_{ij}): # upper choosing option (j) on item (i).
- (L\_{ij}): # lower choosing option (j) on item (i).

### Formula

[
D_{ij} = \frac{U_{ij}}{N_U} - \frac{L_{ij}}{N_L}
]

### Interpretation

- For the **correct option** (j^_): want (D\_{i,j^_} > 0) (upper choose it more).
- For **distractors** (j\neq j^\*): want (D\_{ij} < 0) (lower choose them more).
- If a distractor has (D\_{ij} > 0), it attracts high performers → ambiguity, tricky wording, or content issue.

---

# F. Point-biserial correlation (item discrimination, recommended)

### Method

Correlate whether the student got the item correct with their total ability proxy (test score). Use rest score (T^{(-i)}) to avoid part–whole inflation.

Define (X\_{is}\in{0,1}) for student (s).

Let:

- (p_i = \Pr(X_i=1)), (q_i = 1-p_i).
- (\bar T_1): mean of (T^{(-i)}) among students with (X_i=1).
- (\bar T_0): mean of (T^{(-i)}) among students with (X_i=0).
- (s_T): SD of (T^{(-i)}) across all students.

### Formula

[
r_{pb}(X_i, T^{(-i)}) = \frac{\bar T_1 - \bar T_0}{s_T}\sqrt{p_i q_i}
]

### Interpretation

- (r\_{pb}) close to 1: very discriminating; near 0: weak.
- Typical thresholds:

  - (r\_{pb} \ge 0.30): good
  - (0.20 \le r\_{pb} < 0.30): acceptable
  - (0.10 \le r\_{pb} < 0.20): weak
  - (r\_{pb} < 0): serious problem (keying/ambiguity/misalignment)

---

# G. Point-biserial at the option level (distractor quality)

### Method

For each option, create a binary indicator: selected vs not selected, and correlate with total score (again use rest score).

Define for student (s):
[
X_{ij,s} =
\begin{cases}
1 & \text{if student selects option } j \text{ on item } i\
0 & \text{otherwise}
\end{cases}
]

Let:

- (p*{ij} = \Pr(X*{ij}=1)), (q*{ij}=1-p*{ij})
- (\bar T_1): mean (T^{(-i)}) among those choosing option (j)
- (\bar T_0): mean (T^{(-i)}) among those not choosing option (j)

### Formula

[
r_{pb}(X_{ij}, T^{(-i)}) = \frac{\bar T_1 - \bar T_0}{s_T}\sqrt{p_{ij} q_{ij}}
]

### Interpretation

- **Correct option** (j^\*): want **positive** (r\_{pb}) (ideally ≥ 0.20).
- **Distractors**: want **negative** (r\_{pb}).
- Flags:

  - distractor (r\_{pb} > 0): attracts strong students → ambiguity or multiple plausible answers
  - distractor (r\_{pb} \approx 0): not informative / non-functional
  - correct option (r\_{pb} \le 0): likely defective item

---

# H. Reliability of the whole test (KR-20 / Cronbach’s alpha)

For dichotomous items (correct/incorrect), KR-20 is standard (alpha is equivalent under this scoring).

Let (\sigma_T^2) be the variance of total scores (T).

### Formula (KR-20)

[
\text{KR-20}=\frac{k}{k-1}\left(1-\frac{\sum_{i=1}^{k} p_i(1-p_i)}{\sigma_T^2}\right)
]

### Interpretation (rules of thumb)

- (\ge 0.90): excellent (high-stakes)
- (0.80)–(0.90): good
- (0.70)–(0.80): acceptable (classroom)
- (< 0.70): low (short tests like (k=20) may naturally lower this)

---

# I. Item “decision rules” (practical triage)

A common item-review grid (you can adapt):

1. **Keep (good item)** if:

- (0.30 \le p*i \le 0.80) AND (r*{pb}\ge 0.20) AND DE ≥ 75%

2. **Revise** if any holds:

- (p_i > 0.80) with DE ≤ 50% (too easy due to weak distractors)
- (p_i < 0.30) with low discrimination (unclear or too hard)
- any distractor has (r*{pb} > 0) or (D*{ij} > 0)

3. **Investigate immediately** if:

- (r\_{pb} < 0) or (D_i < 0) (wrong key / flawed item)

---

## Minimal deliverable structure (what you compute per item)

For each item (i), produce a table with:

- (p*i), (D_i), (r*{pb}(X_i,T^{(-i)}))
- For each option (j): (p*{ij}), (D*{ij}), (r*{pb}(X*{ij},T^{(-i)}))
- DE(\_i)
