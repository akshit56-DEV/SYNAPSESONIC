export type Concept = {
  id: string;
  title: string;
  summary: string;
  retention: number;
  lastReviewed: number | null;
  lastReviewedAt?: number | null;
  createdAt?: number | null;
  reviewDay: number;
  needsReview: boolean;
  parentId?: string;
  quiz: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
};

export type Deck = { name: string; nodes: Concept[] };

export const samples: Record<string, string[][]> = {
  "Neural Networks": [
    [
      "Perceptron",
      "A single unit combines weighted inputs and applies an activation function.",
    ],
    [
      "Backpropagation",
      "Gradients flow backward through the network using the chain rule.",
    ],
    [
      "Gradient descent",
      "Parameters move opposite the gradient to reduce a loss function.",
    ],
    [
      "Dropout",
      "Randomly disabling units during training reduces reliance on individual features.",
    ],
    [
      "Activation function",
      "A nonlinear transformation allows stacked layers to learn complex patterns.",
    ],
    [
      "Learning rate",
      "The step size determines how far each optimization update moves.",
    ],
  ],
  "Optical Fiber & Holography": [
    [
      "Total internal reflection",
      "Light reflects entirely at an interface above the critical angle.",
    ],
    [
      "Numerical aperture",
      "The acceptance cone determines which incident rays a fiber can guide.",
    ],
    [
      "Cladding",
      "A lower-index outer layer confines light to the fiber core.",
    ],
    [
      "Interference",
      "Overlapping coherent waves create a pattern of bright and dark fringes.",
    ],
    [
      "Reference beam",
      "A known wave interferes with the object wave to record a hologram.",
    ],
    [
      "Diffraction",
      "Light spreads as it passes through an aperture or around an edge.",
    ],
  ],
  "Quantum Mechanics": [
    [
      "Superposition",
      "A state can be expressed as a linear combination of basis states.",
    ],
    [
      "Entanglement",
      "A composite state cannot be factored into independent subsystem states.",
    ],
    [
      "Tunneling",
      "A particle can cross a potential barrier even below its classical energy threshold.",
    ],
    [
      "Born rule",
      "The squared amplitude gives the probability of a measurement outcome.",
    ],
    [
      "Uncertainty principle",
      "Position and momentum spreads have a nonzero lower bound.",
    ],
    [
      "Quantization",
      "Some observables admit discrete rather than continuous measurement values.",
    ],
  ],
};

const CONCEPTUAL_QUIZZES: Record<
  string,
  {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }
> = {
  Perceptron: {
    question:
      "Why is a single-layer perceptron incapable of solving the XOR classification problem?",
    options: [
      "XOR is not linearly separable, requiring a non-linear partition of the input space",
      "Perceptrons cannot optimize negative weights without momentum updates",
      "The step activation function's derivative is undefined at the origin",
      "Parity functions violate the Perceptron Convergence Theorem",
    ],
    correctIndex: 0,
    explanation:
      "A single linear decision boundary cannot separate (0,1) and (1,0) from (0,0) and (1,1). Multi-layer networks with non-linear activations are required.",
  },
  Backpropagation: {
    question:
      "What fundamental mathematical principle allows backpropagation to compute gradients through deep layers?",
    options: [
      "Matrix inversion to solve the optimal weight parameters in closed form",
      "The chain rule of calculus, decomposing end-to-end loss gradients into local Jacobian products",
      "Convex projection of multi-dimensional loss surfaces into 2D linear subspaces",
      "Stochastic approximation of second-order Hessian curvature matrices",
    ],
    correctIndex: 1,
    explanation:
      "The chain rule allows computing the partial derivative of the scalar loss with respect to any intermediate weight by propagating error gradients backward from the output.",
  },
  "Gradient descent": {
    question:
      "What happens to the parameter trajectory in gradient descent when the learning rate is set excessively high?",
    options: [
      "Updates overshoot loss valley walls, leading to wild oscillations or divergence",
      "The optimization trajectory becomes trapped in the nearest sharp saddle point",
      "Weight updates diminish to zero due to catastrophic numerical underflow",
      "The parameter vector freezes because gradients cancel symmetrically",
    ],
    correctIndex: 0,
    explanation:
      "An excessively large step size overshoots the minimum, bouncing up opposite valley walls and causing diverging parameter values.",
  },
  Dropout: {
    question:
      "Why does standard inverted dropout scale the retained activations by 1 / (1 - p) during training?",
    options: [
      "To artificially boost gradient magnitudes and prevent vanishing gradients",
      "To transform saturated ReLU units into normalized probability distributions",
      "To ensure the expected sum of activations matches training without needing test-time scaling",
      "To force dropped units to recover during the backward pass",
    ],
    correctIndex: 2,
    explanation:
      "Inverted dropout scales surviving activations by 1/(1-p) during training so that during inference, test evaluation runs unmodified with expected activations preserved.",
  },
  "Activation function": {
    question:
      "What happens if every hidden layer in a deep neural network uses a purely linear activation function?",
    options: [
      "The entire deep network collapses mathematically into an equivalent single linear model",
      "The network becomes immune to vanishing gradients while retaining deep expressive power",
      "The network requires twice as many hidden units to approximate non-linear boundaries",
      "Backpropagation fails because the second derivative of linear layers is undefined",
    ],
    correctIndex: 0,
    explanation:
      "Because the composition of linear transformations W2(W1x) is simply (W2·W1)x, stacking linear layers without non-linearities offers zero additional expressive capacity.",
  },
  "Learning rate": {
    question:
      "What core tradeoff dictates the selection of the learning rate hyperparameter in neural network training?",
    options: [
      "Trading batch processing throughput for GPU memory bandwidth utilization",
      "Balancing L1 sparsity penalties against L2 weight shrinkage decay",
      "Balancing input feature resolution against convolutional receptive field size",
      "Balancing convergence speed against the risk of instability, oscillation, or divergence",
    ],
    correctIndex: 3,
    explanation:
      "Too small a learning rate causes agonizingly slow training or stalling in plateaus; too large causes erratic updates, overshoot, and divergence.",
  },
};

export function makeDeck(name: string, pairs: string[][]): Deck {
  const unique = pairs
    .filter(
      ([t, s], i) =>
        t &&
        s &&
        pairs.findIndex(([v]) => v.toLowerCase() === t.toLowerCase()) === i
    )
    .slice(0, 15);
  if (unique.length < 3) {
    throw new Error(
      "At least three distinct concepts are needed. Try a longer text or scanned PDF."
    );
  }
  return {
    name,
    nodes: unique.map(([title, summary], i) => {
      // Check for curated conceptual question
      const curated = CONCEPTUAL_QUIZZES[title];
      let quiz;

      if (curated) {
        quiz = { ...curated };
      } else {
        const correctIndex = (i * 3 + 1) % 4;
        const others = unique
          .filter(([t]) => t.toLowerCase() !== title.toLowerCase())
          .map(([t]) => t);
        while (others.length < 3) {
          others.push(
            others.length === 2 ? "None of the above" : "General Principle"
          );
        }
        const options = others.slice(0, 3);
        options.splice(correctIndex, 0, title);
        quiz = {
          question: `Which fundamental principle governs "${title}"?`,
          options,
          correctIndex,
          explanation: `${title}: ${summary}`,
        };
      }

      const now = Date.now();
      return {
        id: `${name}:${i}`,
        title,
        summary,
        retention: [82, 54, 74, 38, 88, 62][i % 6],
        reviewDay: 0,
        lastReviewed: now,
        lastReviewedAt: now,
        createdAt: now,
        needsReview: false,
        quiz,
      };
    }),
  };
}

export function elapsedDaysSince(n: Concept, now = Date.now()): number {
  const ts =
    typeof n.lastReviewedAt === "number" && n.lastReviewedAt > 0
      ? n.lastReviewedAt
      : typeof n.lastReviewed === "number" && n.lastReviewed > 1_000_000_000
        ? n.lastReviewed
        : typeof n.createdAt === "number" && n.createdAt > 0
          ? n.createdAt
          : null;
  if (!ts) return 0;
  return Math.max(0, (now - ts) / 86_400_000);
}

export function retentionAt(n: Concept, day = 0, now = Date.now()) {
  const base = Math.max(0, n.retention ?? 0);
  const calendarDays = elapsedDaysSince(n, now);
  const manualOffset = Math.max(0, day - (n.reviewDay ?? 0));
  const effectiveDays = Math.max(calendarDays, manualOffset);
  return Math.round(
    base * Math.exp(-effectiveDays / (9 + base * 0.32))
  );
}
