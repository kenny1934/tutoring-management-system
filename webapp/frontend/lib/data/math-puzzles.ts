/**
 * Math Puzzle Dataset for Daily Puzzle Feature
 *
 * 200+ questions across categories:
 * - Number Theory (nt-)
 * - Famous Mathematicians (fm-)
 * - Mathematical Constants (mc-)
 * - Geometry (geo-)
 * - Algebra (alg-)
 * - Probability & Statistics (prob-)
 * - Math History (hist-)
 * - Logic Puzzles (logic-)
 */

export interface MathPuzzle {
  id: string;
  question: string;
  correctAnswer: string;
  incorrectAnswers: [string, string, string];
  category: string;
  difficulty: 1 | 2 | 3;
}

export const MATH_PUZZLES: readonly MathPuzzle[] = [
  // =====================
  // NUMBER THEORY (40)
  // =====================
  {
    id: "nt-001",
    question: "What is the only even prime number?",
    correctAnswer: "2",
    incorrectAnswers: ["1", "4", "0"],
    category: "number-theory",
    difficulty: 1
  },
  {
    id: "nt-002",
    question: "The sum of the first 100 positive integers equals:",
    correctAnswer: "5050",
    incorrectAnswers: ["5000", "4950", "5100"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-003",
    question: "What are the first two prime numbers that differ by 2 called?",
    correctAnswer: "Twin primes",
    incorrectAnswers: ["Cousin primes", "Sexy primes", "Sophie Germain primes"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-004",
    question: "What is the smallest perfect number?",
    correctAnswer: "6",
    incorrectAnswers: ["1", "28", "12"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-005",
    question: "The Fibonacci sequence starts with 0, 1, 1, 2, 3, 5, 8... What is the 10th Fibonacci number?",
    correctAnswer: "34",
    incorrectAnswers: ["55", "21", "89"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-006",
    question: "What is the sum of all prime numbers less than 10?",
    correctAnswer: "17",
    incorrectAnswers: ["15", "18", "28"],
    category: "number-theory",
    difficulty: 1
  },
  {
    id: "nt-007",
    question: "What is the least common multiple of 12 and 18?",
    correctAnswer: "36",
    incorrectAnswers: ["54", "72", "216"],
    category: "number-theory",
    difficulty: 1
  },
  {
    id: "nt-008",
    question: "What is the GCD (greatest common divisor) of 48 and 180?",
    correctAnswer: "12",
    incorrectAnswers: ["6", "18", "24"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-009",
    question: "How many prime numbers are there between 1 and 100?",
    correctAnswer: "25",
    incorrectAnswers: ["21", "23", "29"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-010",
    question: "What is the name for a number that equals the sum of its proper divisors?",
    correctAnswer: "Perfect number",
    incorrectAnswers: ["Abundant number", "Deficient number", "Amicable number"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-011",
    question: "What is 7! (7 factorial)?",
    correctAnswer: "5040",
    incorrectAnswers: ["720", "40320", "2520"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-012",
    question: "The number 1729 is famous for being the smallest number expressible as the sum of two cubes in two different ways. Whose name is associated with this number?",
    correctAnswer: "Ramanujan",
    incorrectAnswers: ["Euler", "Hardy", "Gauss"],
    category: "number-theory",
    difficulty: 3
  },
  {
    id: "nt-013",
    question: "What is the second perfect number after 6?",
    correctAnswer: "28",
    incorrectAnswers: ["12", "36", "496"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-014",
    question: "Numbers of the form 2^n - 1 that are prime are called:",
    correctAnswer: "Mersenne primes",
    incorrectAnswers: ["Fermat primes", "Sophie Germain primes", "Gaussian primes"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-015",
    question: "What is the smallest prime number greater than 100?",
    correctAnswer: "101",
    incorrectAnswers: ["103", "107", "109"],
    category: "number-theory",
    difficulty: 1
  },
  {
    id: "nt-016",
    question: "How many divisors does the number 36 have?",
    correctAnswer: "9",
    incorrectAnswers: ["6", "8", "12"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-017",
    question: "What is the sum of the digits of 2^100?",
    correctAnswer: "115",
    incorrectAnswers: ["100", "127", "108"],
    category: "number-theory",
    difficulty: 3
  },
  {
    id: "nt-018",
    question: "The sequence 1, 1, 2, 5, 14, 42, 132... are known as:",
    correctAnswer: "Catalan numbers",
    incorrectAnswers: ["Bell numbers", "Stirling numbers", "Lucas numbers"],
    category: "number-theory",
    difficulty: 3
  },
  {
    id: "nt-019",
    question: "What is the last digit of 7^100?",
    correctAnswer: "1",
    incorrectAnswers: ["7", "9", "3"],
    category: "number-theory",
    difficulty: 3
  },
  {
    id: "nt-020",
    question: "Two numbers are called 'amicable' when:",
    correctAnswer: "Each is the sum of the proper divisors of the other",
    incorrectAnswers: ["They share the same digits", "Their GCD is 1", "They are both perfect numbers"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-021",
    question: "What is the smallest abundant number?",
    correctAnswer: "12",
    incorrectAnswers: ["18", "20", "24"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-022",
    question: "The prime factorization of 2024 is:",
    correctAnswer: "2³ × 11 × 23",
    incorrectAnswers: ["2³ × 253", "8 × 11 × 23", "2² × 506"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-023",
    question: "What is Euler's totient function φ(12)?",
    correctAnswer: "4",
    incorrectAnswers: ["6", "3", "5"],
    category: "number-theory",
    difficulty: 3
  },
  {
    id: "nt-024",
    question: "The number 153 is an Armstrong number. What makes a number an Armstrong number?",
    correctAnswer: "Sum of cubes of its digits equals the number",
    incorrectAnswers: ["Sum of digits equals the number", "Product of digits equals the number", "It's divisible by sum of its digits"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-025",
    question: "What is the 20th Fibonacci number?",
    correctAnswer: "6765",
    incorrectAnswers: ["4181", "10946", "2584"],
    category: "number-theory",
    difficulty: 3
  },
  {
    id: "nt-026",
    question: "A triangular number is a number that can form an equilateral triangle. What is the 10th triangular number?",
    correctAnswer: "55",
    incorrectAnswers: ["45", "66", "36"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-027",
    question: "What is the smallest number divisible by all integers from 1 to 10?",
    correctAnswer: "2520",
    incorrectAnswers: ["3628800", "5040", "1260"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-028",
    question: "The Collatz Conjecture involves repeatedly applying a function. If n is even, divide by 2. If n is odd, what do you do?",
    correctAnswer: "Multiply by 3 and add 1",
    incorrectAnswers: ["Add 1", "Multiply by 3", "Subtract 1"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-029",
    question: "What is the remainder when 2^2024 is divided by 7?",
    correctAnswer: "2",
    incorrectAnswers: ["1", "4", "0"],
    category: "number-theory",
    difficulty: 3
  },
  {
    id: "nt-030",
    question: "A palindromic prime reads the same forwards and backwards. Which is NOT a palindromic prime?",
    correctAnswer: "123",
    incorrectAnswers: ["131", "151", "181"],
    category: "number-theory",
    difficulty: 1
  },
  {
    id: "nt-031",
    question: "What is the digital root of 987654321?",
    correctAnswer: "9",
    incorrectAnswers: ["45", "6", "1"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-032",
    question: "How many trailing zeros does 100! have?",
    correctAnswer: "24",
    incorrectAnswers: ["20", "25", "10"],
    category: "number-theory",
    difficulty: 3
  },
  {
    id: "nt-033",
    question: "The sum 1 + 2 + 3 + ... + n can be calculated using which formula?",
    correctAnswer: "n(n+1)/2",
    incorrectAnswers: ["n²/2", "n(n-1)/2", "(n+1)²/2"],
    category: "number-theory",
    difficulty: 1
  },
  {
    id: "nt-034",
    question: "What is the value of the infinite continued fraction [1; 1, 1, 1, ...]?",
    correctAnswer: "The golden ratio (φ)",
    incorrectAnswers: ["√2", "e", "π"],
    category: "number-theory",
    difficulty: 3
  },
  {
    id: "nt-035",
    question: "A highly composite number has more divisors than any smaller positive integer. What is the smallest highly composite number greater than 12?",
    correctAnswer: "24",
    incorrectAnswers: ["18", "36", "48"],
    category: "number-theory",
    difficulty: 3
  },
  {
    id: "nt-036",
    question: "What is 15 choose 3 (the binomial coefficient C(15,3))?",
    correctAnswer: "455",
    incorrectAnswers: ["560", "364", "210"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-037",
    question: "Numbers of the form 2^(2^n) + 1 are called:",
    correctAnswer: "Fermat numbers",
    incorrectAnswers: ["Mersenne numbers", "Perfect numbers", "Carmichael numbers"],
    category: "number-theory",
    difficulty: 2
  },
  {
    id: "nt-038",
    question: "What is special about the number 142857?",
    correctAnswer: "It's a cyclic number (multiplying by 1-6 permutes its digits)",
    incorrectAnswers: ["It's a perfect number", "It's a Fibonacci number", "It's a prime number"],
    category: "number-theory",
    difficulty: 3
  },
  {
    id: "nt-039",
    question: "The smallest composite number is:",
    correctAnswer: "4",
    incorrectAnswers: ["1", "6", "9"],
    category: "number-theory",
    difficulty: 1
  },
  {
    id: "nt-040",
    question: "What percentage of integers are divisible by at least one of 2, 3, or 5?",
    correctAnswer: "73.33%",
    incorrectAnswers: ["50%", "66.67%", "80%"],
    category: "number-theory",
    difficulty: 3
  },

  // =====================
  // FAMOUS MATHEMATICIANS (30)
  // =====================
  {
    id: "fm-001",
    question: "Who is often called the 'Father of Mathematics'?",
    correctAnswer: "Archimedes",
    incorrectAnswers: ["Pythagoras", "Euclid", "Thales"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-002",
    question: "Which mathematician is famous for his 'Last Theorem' that took over 350 years to prove?",
    correctAnswer: "Pierre de Fermat",
    incorrectAnswers: ["Carl Gauss", "Leonhard Euler", "Isaac Newton"],
    category: "famous-mathematicians",
    difficulty: 1
  },
  {
    id: "fm-003",
    question: "Who proved Fermat's Last Theorem in 1995?",
    correctAnswer: "Andrew Wiles",
    incorrectAnswers: ["Grigori Perelman", "Terence Tao", "John Nash"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-004",
    question: "Which mathematician developed the theory of general relativity alongside physics?",
    correctAnswer: "Albert Einstein",
    incorrectAnswers: ["David Hilbert", "Henri Poincaré", "Hermann Minkowski"],
    category: "famous-mathematicians",
    difficulty: 1
  },
  {
    id: "fm-005",
    question: "Emmy Noether made fundamental contributions to which area of mathematics?",
    correctAnswer: "Abstract algebra",
    incorrectAnswers: ["Number theory", "Topology", "Probability theory"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-006",
    question: "Who wrote 'Elements', one of the most influential works in the history of mathematics?",
    correctAnswer: "Euclid",
    incorrectAnswers: ["Aristotle", "Plato", "Pythagoras"],
    category: "famous-mathematicians",
    difficulty: 1
  },
  {
    id: "fm-007",
    question: "Which mathematician is known for having a 'conjecture' about the distribution of prime numbers that was proved in 1896?",
    correctAnswer: "Bernhard Riemann",
    incorrectAnswers: ["Carl Gauss", "Leonhard Euler", "Pierre-Simon Laplace"],
    category: "famous-mathematicians",
    difficulty: 3
  },
  {
    id: "fm-008",
    question: "Which Indian mathematician independently discovered many theorems and formulas, including infinite series, without formal training?",
    correctAnswer: "Srinivasa Ramanujan",
    incorrectAnswers: ["Aryabhata", "Brahmagupta", "Bhaskara II"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-009",
    question: "Who developed the first general-purpose computer algorithm and is considered the first computer programmer?",
    correctAnswer: "Ada Lovelace",
    incorrectAnswers: ["Grace Hopper", "Charles Babbage", "Alan Turing"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-010",
    question: "Which mathematician is famous for his work on the foundations of calculus and his laws of motion?",
    correctAnswer: "Isaac Newton",
    incorrectAnswers: ["Gottfried Leibniz", "Leonhard Euler", "Joseph Lagrange"],
    category: "famous-mathematicians",
    difficulty: 1
  },
  {
    id: "fm-011",
    question: "Who introduced the notation for integrals (∫) and developed calculus independently from Newton?",
    correctAnswer: "Gottfried Wilhelm Leibniz",
    incorrectAnswers: ["Leonhard Euler", "Jakob Bernoulli", "Johann Bernoulli"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-012",
    question: "Which mathematician proved the Poincaré Conjecture and declined the Fields Medal?",
    correctAnswer: "Grigori Perelman",
    incorrectAnswers: ["Alexander Grothendieck", "Paul Erdős", "Jean-Pierre Serre"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-013",
    question: "Who is known as the 'Prince of Mathematicians' and contributed to number theory, statistics, and analysis?",
    correctAnswer: "Carl Friedrich Gauss",
    incorrectAnswers: ["Leonhard Euler", "Isaac Newton", "Bernhard Riemann"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-014",
    question: "Which mathematician's name is attached to the concept of 'imaginary' numbers (i = √-1)?",
    correctAnswer: "Leonhard Euler",
    incorrectAnswers: ["René Descartes", "Carl Gauss", "Gerolamo Cardano"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-015",
    question: "Who developed game theory and is the subject of the film 'A Beautiful Mind'?",
    correctAnswer: "John Nash",
    incorrectAnswers: ["John von Neumann", "Alan Turing", "Claude Shannon"],
    category: "famous-mathematicians",
    difficulty: 1
  },
  {
    id: "fm-016",
    question: "Which ancient Greek mathematician famously shouted 'Eureka!' after discovering the principle of buoyancy?",
    correctAnswer: "Archimedes",
    incorrectAnswers: ["Pythagoras", "Euclid", "Thales"],
    category: "famous-mathematicians",
    difficulty: 1
  },
  {
    id: "fm-017",
    question: "Who developed set theory, including the concept of different sizes of infinity?",
    correctAnswer: "Georg Cantor",
    incorrectAnswers: ["David Hilbert", "Ernst Zermelo", "Bertrand Russell"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-018",
    question: "Which French mathematician founded probability theory alongside Blaise Pascal?",
    correctAnswer: "Pierre de Fermat",
    incorrectAnswers: ["René Descartes", "Joseph-Louis Lagrange", "Pierre-Simon Laplace"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-019",
    question: "Who is famous for the 'Incompleteness Theorems' showing limitations of formal mathematical systems?",
    correctAnswer: "Kurt Gödel",
    incorrectAnswers: ["Alan Turing", "Bertrand Russell", "David Hilbert"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-020",
    question: "Which mathematician is known for co-authoring over 1,500 papers with many collaborators, leading to the 'Erdős number'?",
    correctAnswer: "Paul Erdős",
    incorrectAnswers: ["John von Neumann", "Alexander Grothendieck", "Jean-Pierre Serre"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-021",
    question: "Who formalized the concept of an algorithm and the 'Turing machine'?",
    correctAnswer: "Alan Turing",
    incorrectAnswers: ["John von Neumann", "Claude Shannon", "Kurt Gödel"],
    category: "famous-mathematicians",
    difficulty: 1
  },
  {
    id: "fm-022",
    question: "Which woman was the first to win the Fields Medal (2014)?",
    correctAnswer: "Maryam Mirzakhani",
    incorrectAnswers: ["Karen Uhlenbeck", "Sophie Germain", "Emmy Noether"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-023",
    question: "Who created analytic geometry by combining algebra and geometry?",
    correctAnswer: "René Descartes",
    incorrectAnswers: ["Pierre de Fermat", "Blaise Pascal", "Isaac Newton"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-024",
    question: "Which mathematician proved that there are infinitely many prime numbers?",
    correctAnswer: "Euclid",
    incorrectAnswers: ["Eratosthenes", "Pythagoras", "Archimedes"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-025",
    question: "Who invented logarithms?",
    correctAnswer: "John Napier",
    incorrectAnswers: ["Henry Briggs", "Leonhard Euler", "Isaac Newton"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-026",
    question: "Which mathematician developed Boolean algebra, the foundation of digital circuit design?",
    correctAnswer: "George Boole",
    incorrectAnswers: ["Charles Babbage", "Alan Turing", "Claude Shannon"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-027",
    question: "Who pioneered the field of topology and is known for the 'Seven Bridges of Königsberg' problem?",
    correctAnswer: "Leonhard Euler",
    incorrectAnswers: ["Henri Poincaré", "Bernhard Riemann", "Felix Klein"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-028",
    question: "Which Indian mathematician calculated pi (π) to four decimal places around 500 CE?",
    correctAnswer: "Aryabhata",
    incorrectAnswers: ["Brahmagupta", "Bhaskara II", "Madhava"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-029",
    question: "Who proved that not all mathematical truths can be proven within a consistent system?",
    correctAnswer: "Kurt Gödel",
    incorrectAnswers: ["Bertrand Russell", "David Hilbert", "Alfred Tarski"],
    category: "famous-mathematicians",
    difficulty: 2
  },
  {
    id: "fm-030",
    question: "Which Persian mathematician wrote 'Al-Kitab al-mukhtasar fi hisab al-jabr wal-muqabala', giving us the word 'algebra'?",
    correctAnswer: "Al-Khwarizmi",
    incorrectAnswers: ["Omar Khayyam", "Al-Biruni", "Nasir al-Din al-Tusi"],
    category: "famous-mathematicians",
    difficulty: 2
  },

  // =====================
  // MATHEMATICAL CONSTANTS (20)
  // =====================
  {
    id: "mc-001",
    question: "What is the value of pi (π) to 5 decimal places?",
    correctAnswer: "3.14159",
    incorrectAnswers: ["3.14169", "3.14149", "3.14259"],
    category: "constants",
    difficulty: 1
  },
  {
    id: "mc-002",
    question: "What is Euler's number (e) approximately equal to?",
    correctAnswer: "2.71828",
    incorrectAnswers: ["2.17828", "2.71818", "2.78128"],
    category: "constants",
    difficulty: 2
  },
  {
    id: "mc-003",
    question: "The golden ratio φ (phi) is approximately:",
    correctAnswer: "1.618",
    incorrectAnswers: ["1.414", "1.732", "2.236"],
    category: "constants",
    difficulty: 2
  },
  {
    id: "mc-004",
    question: "What is √2 approximately equal to?",
    correctAnswer: "1.414",
    incorrectAnswers: ["1.618", "1.732", "1.259"],
    category: "constants",
    difficulty: 1
  },
  {
    id: "mc-005",
    question: "Euler's identity (e^(iπ) + 1 = 0) connects five fundamental constants. Which is NOT one of them?",
    correctAnswer: "φ (golden ratio)",
    incorrectAnswers: ["e", "π", "i"],
    category: "constants",
    difficulty: 2
  },
  {
    id: "mc-006",
    question: "The Euler-Mascheroni constant γ (gamma) is approximately:",
    correctAnswer: "0.5772",
    incorrectAnswers: ["0.6931", "0.4343", "0.6180"],
    category: "constants",
    difficulty: 3
  },
  {
    id: "mc-007",
    question: "What is the value of √3?",
    correctAnswer: "1.732",
    incorrectAnswers: ["1.414", "1.618", "2.236"],
    category: "constants",
    difficulty: 1
  },
  {
    id: "mc-008",
    question: "The plastic constant (ρ) is the real root of x³ = x + 1 and approximately equals:",
    correctAnswer: "1.3247",
    incorrectAnswers: ["1.6180", "1.4142", "1.2599"],
    category: "constants",
    difficulty: 3
  },
  {
    id: "mc-009",
    question: "What is ln(2) (natural log of 2) approximately?",
    correctAnswer: "0.693",
    incorrectAnswers: ["0.301", "1.099", "0.434"],
    category: "constants",
    difficulty: 2
  },
  {
    id: "mc-010",
    question: "The Feigenbaum constant δ ≈ 4.669 appears in which area of mathematics?",
    correctAnswer: "Chaos theory",
    incorrectAnswers: ["Number theory", "Geometry", "Linear algebra"],
    category: "constants",
    difficulty: 3
  },
  {
    id: "mc-011",
    question: "What is √5 approximately equal to?",
    correctAnswer: "2.236",
    incorrectAnswers: ["2.449", "2.000", "1.732"],
    category: "constants",
    difficulty: 1
  },
  {
    id: "mc-012",
    question: "The golden ratio φ satisfies the equation:",
    correctAnswer: "φ² = φ + 1",
    incorrectAnswers: ["φ² = 2φ", "φ² = φ - 1", "φ² = 2"],
    category: "constants",
    difficulty: 2
  },
  {
    id: "mc-013",
    question: "Apéry's constant ζ(3) is approximately:",
    correctAnswer: "1.202",
    incorrectAnswers: ["1.645", "1.094", "1.414"],
    category: "constants",
    difficulty: 3
  },
  {
    id: "mc-014",
    question: "What is the sum of the infinite series 1 + 1/2² + 1/3² + 1/4² + ...?",
    correctAnswer: "π²/6",
    incorrectAnswers: ["π/4", "e", "ln(2)"],
    category: "constants",
    difficulty: 3
  },
  {
    id: "mc-015",
    question: "What is e^π approximately equal to?",
    correctAnswer: "23.14",
    incorrectAnswers: ["19.99", "27.18", "31.41"],
    category: "constants",
    difficulty: 2
  },
  {
    id: "mc-016",
    question: "The Champernowne constant 0.123456789101112... is:",
    correctAnswer: "Transcendental",
    incorrectAnswers: ["Rational", "Algebraic irrational", "A Liouville number"],
    category: "constants",
    difficulty: 3
  },
  {
    id: "mc-017",
    question: "What is 1/e approximately equal to?",
    correctAnswer: "0.368",
    incorrectAnswers: ["0.318", "0.414", "0.272"],
    category: "constants",
    difficulty: 2
  },
  {
    id: "mc-018",
    question: "The ratio of a circle's circumference to its diameter is:",
    correctAnswer: "π",
    incorrectAnswers: ["2π", "π/2", "e"],
    category: "constants",
    difficulty: 1
  },
  {
    id: "mc-019",
    question: "What is the cube root of 2 (∛2) approximately?",
    correctAnswer: "1.260",
    incorrectAnswers: ["1.414", "1.587", "1.189"],
    category: "constants",
    difficulty: 2
  },
  {
    id: "mc-020",
    question: "Khinchin's constant K ≈ 2.685 is related to:",
    correctAnswer: "Continued fractions",
    incorrectAnswers: ["Prime numbers", "Riemann zeta function", "Differential equations"],
    category: "constants",
    difficulty: 3
  },

  // =====================
  // GEOMETRY (30)
  // =====================
  {
    id: "geo-001",
    question: "What is the sum of interior angles in a triangle?",
    correctAnswer: "180°",
    incorrectAnswers: ["90°", "360°", "270°"],
    category: "geometry",
    difficulty: 1
  },
  {
    id: "geo-002",
    question: "The Pythagorean theorem states that in a right triangle, a² + b² = c². What does c represent?",
    correctAnswer: "The hypotenuse",
    incorrectAnswers: ["The shortest side", "The base", "Any side"],
    category: "geometry",
    difficulty: 1
  },
  {
    id: "geo-003",
    question: "How many faces does a dodecahedron have?",
    correctAnswer: "12",
    incorrectAnswers: ["10", "20", "8"],
    category: "geometry",
    difficulty: 2
  },
  {
    id: "geo-004",
    question: "What is the sum of interior angles in a hexagon?",
    correctAnswer: "720°",
    incorrectAnswers: ["540°", "900°", "1080°"],
    category: "geometry",
    difficulty: 2
  },
  {
    id: "geo-005",
    question: "A regular polygon with all sides and angles equal is called:",
    correctAnswer: "Equilateral and equiangular",
    incorrectAnswers: ["Convex", "Concyclic", "Similar"],
    category: "geometry",
    difficulty: 1
  },
  {
    id: "geo-006",
    question: "How many edges does a cube have?",
    correctAnswer: "12",
    incorrectAnswers: ["6", "8", "10"],
    category: "geometry",
    difficulty: 1
  },
  {
    id: "geo-007",
    question: "What is the formula for the volume of a sphere?",
    correctAnswer: "(4/3)πr³",
    incorrectAnswers: ["4πr²", "πr³", "(2/3)πr³"],
    category: "geometry",
    difficulty: 2
  },
  {
    id: "geo-008",
    question: "In a circle, the angle inscribed in a semicircle is always:",
    correctAnswer: "90°",
    incorrectAnswers: ["180°", "60°", "45°"],
    category: "geometry",
    difficulty: 2
  },
  {
    id: "geo-009",
    question: "How many Platonic solids exist?",
    correctAnswer: "5",
    incorrectAnswers: ["4", "6", "7"],
    category: "geometry",
    difficulty: 2
  },
  {
    id: "geo-010",
    question: "What is the name of a polygon with 10 sides?",
    correctAnswer: "Decagon",
    incorrectAnswers: ["Dodecagon", "Nonagon", "Hendecagon"],
    category: "geometry",
    difficulty: 1
  },
  {
    id: "geo-011",
    question: "The diagonal of a unit square has length:",
    correctAnswer: "√2",
    incorrectAnswers: ["2", "√3", "1.5"],
    category: "geometry",
    difficulty: 1
  },
  {
    id: "geo-012",
    question: "A shape that can tile the plane without gaps or overlaps is called:",
    correctAnswer: "A tessellation",
    incorrectAnswers: ["A fractal", "A convex polygon", "An isometry"],
    category: "geometry",
    difficulty: 2
  },
  {
    id: "geo-013",
    question: "What is the Euler characteristic (V - E + F) of a convex polyhedron?",
    correctAnswer: "2",
    incorrectAnswers: ["0", "1", "-2"],
    category: "geometry",
    difficulty: 2
  },
  {
    id: "geo-014",
    question: "How many diagonals does a convex pentagon have?",
    correctAnswer: "5",
    incorrectAnswers: ["4", "6", "10"],
    category: "geometry",
    difficulty: 2
  },
  {
    id: "geo-015",
    question: "The surface area of a sphere with radius r is:",
    correctAnswer: "4πr²",
    incorrectAnswers: ["2πr²", "πr²", "(4/3)πr³"],
    category: "geometry",
    difficulty: 2
  },
  {
    id: "geo-016",
    question: "What is a polygon with 7 sides called?",
    correctAnswer: "Heptagon",
    incorrectAnswers: ["Hexagon", "Octagon", "Septagon"],
    category: "geometry",
    difficulty: 1
  },
  {
    id: "geo-017",
    question: "The golden ratio appears in a regular pentagon when comparing:",
    correctAnswer: "The diagonal to the side",
    incorrectAnswers: ["The area to the perimeter", "Two adjacent sides", "The apothem to the side"],
    category: "geometry",
    difficulty: 2
  },
  {
    id: "geo-018",
    question: "How many vertices does an icosahedron have?",
    correctAnswer: "12",
    incorrectAnswers: ["20", "30", "10"],
    category: "geometry",
    difficulty: 3
  },
  {
    id: "geo-019",
    question: "A triangle with sides 3, 4, 5 is:",
    correctAnswer: "A right triangle",
    incorrectAnswers: ["An equilateral triangle", "An obtuse triangle", "An acute triangle"],
    category: "geometry",
    difficulty: 1
  },
  {
    id: "geo-020",
    question: "The locus of points equidistant from two fixed points is:",
    correctAnswer: "The perpendicular bisector",
    incorrectAnswers: ["A circle", "A parabola", "The angle bisector"],
    category: "geometry",
    difficulty: 2
  },
  {
    id: "geo-021",
    question: "What is the name of the point where a triangle's medians intersect?",
    correctAnswer: "Centroid",
    incorrectAnswers: ["Orthocenter", "Circumcenter", "Incenter"],
    category: "geometry",
    difficulty: 2
  },
  {
    id: "geo-022",
    question: "A quadrilateral with exactly one pair of parallel sides is called:",
    correctAnswer: "A trapezoid",
    incorrectAnswers: ["A parallelogram", "A rhombus", "A kite"],
    category: "geometry",
    difficulty: 1
  },
  {
    id: "geo-023",
    question: "The ratio of the circumference of a circle to its diameter is:",
    correctAnswer: "π",
    incorrectAnswers: ["2π", "π/2", "2πr"],
    category: "geometry",
    difficulty: 1
  },
  {
    id: "geo-024",
    question: "How many faces does an octahedron have?",
    correctAnswer: "8",
    incorrectAnswers: ["6", "10", "12"],
    category: "geometry",
    difficulty: 2
  },
  {
    id: "geo-025",
    question: "The four points where altitudes intersect in a triangle is called the:",
    correctAnswer: "Orthocenter",
    incorrectAnswers: ["Centroid", "Circumcenter", "Incenter"],
    category: "geometry",
    difficulty: 2
  },
  {
    id: "geo-026",
    question: "A chord that passes through the center of a circle is called:",
    correctAnswer: "A diameter",
    incorrectAnswers: ["A radius", "A secant", "A tangent"],
    category: "geometry",
    difficulty: 1
  },
  {
    id: "geo-027",
    question: "The angle between a tangent to a circle and a chord drawn from the point of tangency equals:",
    correctAnswer: "Half the intercepted arc",
    incorrectAnswers: ["The intercepted arc", "90°", "Twice the intercepted arc"],
    category: "geometry",
    difficulty: 3
  },
  {
    id: "geo-028",
    question: "A Möbius strip has how many sides?",
    correctAnswer: "1",
    incorrectAnswers: ["2", "0", "3"],
    category: "geometry",
    difficulty: 2
  },
  {
    id: "geo-029",
    question: "What is the volume of a cone with radius r and height h?",
    correctAnswer: "(1/3)πr²h",
    incorrectAnswers: ["πr²h", "(2/3)πr²h", "(1/2)πr²h"],
    category: "geometry",
    difficulty: 2
  },
  {
    id: "geo-030",
    question: "The Nine-Point Circle of a triangle passes through how many significant points?",
    correctAnswer: "9",
    incorrectAnswers: ["3", "6", "12"],
    category: "geometry",
    difficulty: 3
  },

  // =====================
  // ALGEBRA (25)
  // =====================
  {
    id: "alg-001",
    question: "What is the quadratic formula for solving ax² + bx + c = 0?",
    correctAnswer: "x = (-b ± √(b²-4ac)) / 2a",
    incorrectAnswers: ["x = (-b ± √(b²+4ac)) / 2a", "x = (b ± √(b²-4ac)) / 2a", "x = (-b ± √(b²-4ac)) / a"],
    category: "algebra",
    difficulty: 1
  },
  {
    id: "alg-002",
    question: "What is (a + b)² equal to?",
    correctAnswer: "a² + 2ab + b²",
    incorrectAnswers: ["a² + b²", "a² + ab + b²", "2a² + 2b²"],
    category: "algebra",
    difficulty: 1
  },
  {
    id: "alg-003",
    question: "The sum of an arithmetic sequence with first term a, last term l, and n terms is:",
    correctAnswer: "n(a + l) / 2",
    incorrectAnswers: ["(a + l) / 2", "n(a × l) / 2", "a + l + n / 2"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-004",
    question: "What is the sum of the infinite geometric series 1 + 1/2 + 1/4 + 1/8 + ...?",
    correctAnswer: "2",
    incorrectAnswers: ["1", "∞", "1.5"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-005",
    question: "If f(x) = x² and g(x) = x + 1, what is f(g(x))?",
    correctAnswer: "(x + 1)²",
    incorrectAnswers: ["x² + 1", "x² + x + 1", "x³ + 1"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-006",
    question: "The discriminant b² - 4ac tells us how many real roots a quadratic equation has. If it's negative, the equation has:",
    correctAnswer: "No real roots",
    incorrectAnswers: ["One real root", "Two real roots", "Infinitely many roots"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-007",
    question: "What is a³ - b³ factored?",
    correctAnswer: "(a - b)(a² + ab + b²)",
    incorrectAnswers: ["(a - b)(a² - ab + b²)", "(a - b)(a² + b²)", "(a - b)³"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-008",
    question: "The nth term of a geometric sequence with first term a and common ratio r is:",
    correctAnswer: "ar^(n-1)",
    incorrectAnswers: ["ar^n", "a + (n-1)r", "a × n × r"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-009",
    question: "What is log₂(8)?",
    correctAnswer: "3",
    incorrectAnswers: ["2", "4", "8"],
    category: "algebra",
    difficulty: 1
  },
  {
    id: "alg-010",
    question: "If i² = -1, what is i⁴?",
    correctAnswer: "1",
    incorrectAnswers: ["-1", "i", "-i"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-011",
    question: "What is the inverse function of f(x) = 2x + 3?",
    correctAnswer: "f⁻¹(x) = (x - 3) / 2",
    incorrectAnswers: ["f⁻¹(x) = 2x - 3", "f⁻¹(x) = x / 2 - 3", "f⁻¹(x) = 3 - 2x"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-012",
    question: "The Fundamental Theorem of Algebra states that a polynomial of degree n has:",
    correctAnswer: "Exactly n roots (counting multiplicity) in the complex numbers",
    incorrectAnswers: ["At most n roots", "Exactly n distinct roots", "At least n roots"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-013",
    question: "What is the sum of the roots of x² - 5x + 6 = 0?",
    correctAnswer: "5",
    incorrectAnswers: ["6", "-5", "11"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-014",
    question: "By Vieta's formulas, the product of the roots of ax² + bx + c = 0 is:",
    correctAnswer: "c/a",
    incorrectAnswers: ["-b/a", "b/c", "-c/a"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-015",
    question: "What is the general solution to the differential equation dy/dx = y?",
    correctAnswer: "y = Ce^x",
    incorrectAnswers: ["y = x + C", "y = e^x", "y = Cx"],
    category: "algebra",
    difficulty: 3
  },
  {
    id: "alg-016",
    question: "The binomial expansion of (1 + x)^n when n is a positive integer has how many terms?",
    correctAnswer: "n + 1",
    incorrectAnswers: ["n", "n - 1", "2n"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-017",
    question: "What is log(ab) in terms of log(a) and log(b)?",
    correctAnswer: "log(a) + log(b)",
    incorrectAnswers: ["log(a) × log(b)", "log(a) - log(b)", "log(a) / log(b)"],
    category: "algebra",
    difficulty: 1
  },
  {
    id: "alg-018",
    question: "A matrix A is invertible if and only if its determinant is:",
    correctAnswer: "Non-zero",
    incorrectAnswers: ["Positive", "Zero", "Equal to 1"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-019",
    question: "The eigenvalues of a 2×2 identity matrix are:",
    correctAnswer: "1 and 1",
    incorrectAnswers: ["0 and 0", "0 and 1", "1 and -1"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-020",
    question: "What is the remainder when polynomial f(x) is divided by (x - a)?",
    correctAnswer: "f(a)",
    incorrectAnswers: ["f(0)", "f(-a)", "0"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-021",
    question: "The AM-GM inequality states that for positive numbers, the arithmetic mean is:",
    correctAnswer: "Greater than or equal to the geometric mean",
    incorrectAnswers: ["Less than the geometric mean", "Equal to the geometric mean", "Greater than the harmonic mean"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-022",
    question: "What is e^(iπ)?",
    correctAnswer: "-1",
    incorrectAnswers: ["1", "i", "0"],
    category: "algebra",
    difficulty: 2
  },
  {
    id: "alg-023",
    question: "A group in abstract algebra must have an identity element, inverses, and satisfy:",
    correctAnswer: "Associativity",
    incorrectAnswers: ["Commutativity", "Distributivity", "Reflexivity"],
    category: "algebra",
    difficulty: 3
  },
  {
    id: "alg-024",
    question: "The derivative of x^n is:",
    correctAnswer: "nx^(n-1)",
    incorrectAnswers: ["x^(n-1)", "nx^n", "(n-1)x^n"],
    category: "algebra",
    difficulty: 1
  },
  {
    id: "alg-025",
    question: "What is the integral of 1/x?",
    correctAnswer: "ln|x| + C",
    incorrectAnswers: ["x⁻² + C", "x + C", "e^x + C"],
    category: "algebra",
    difficulty: 2
  },

  // =====================
  // PROBABILITY & STATISTICS (25)
  // =====================
  {
    id: "prob-001",
    question: "What is the probability of rolling a 6 on a fair six-sided die?",
    correctAnswer: "1/6",
    incorrectAnswers: ["1/3", "1/12", "1/2"],
    category: "probability",
    difficulty: 1
  },
  {
    id: "prob-002",
    question: "In the Monty Hall problem, should you switch doors after one is revealed?",
    correctAnswer: "Yes, switching gives 2/3 probability",
    incorrectAnswers: ["No, it doesn't matter", "No, staying gives better odds", "Yes, switching gives 1/2 probability"],
    category: "probability",
    difficulty: 2
  },
  {
    id: "prob-003",
    question: "The Birthday Paradox asks: in a group of how many people is there >50% chance two share a birthday?",
    correctAnswer: "23",
    incorrectAnswers: ["50", "183", "365"],
    category: "probability",
    difficulty: 2
  },
  {
    id: "prob-004",
    question: "What is the expected value of rolling a fair six-sided die?",
    correctAnswer: "3.5",
    incorrectAnswers: ["3", "4", "3.6"],
    category: "probability",
    difficulty: 2
  },
  {
    id: "prob-005",
    question: "The number of ways to arrange n distinct objects is:",
    correctAnswer: "n!",
    incorrectAnswers: ["n²", "2^n", "n^n"],
    category: "probability",
    difficulty: 1
  },
  {
    id: "prob-006",
    question: "Bayes' theorem relates P(A|B) to:",
    correctAnswer: "P(B|A), P(A), and P(B)",
    incorrectAnswers: ["Only P(A) and P(B)", "Only P(B|A)", "P(A∩B) only"],
    category: "probability",
    difficulty: 2
  },
  {
    id: "prob-007",
    question: "A distribution is 'normal' or 'Gaussian' if it has what shape?",
    correctAnswer: "Bell curve",
    incorrectAnswers: ["Uniform", "Exponential decay", "Bimodal"],
    category: "probability",
    difficulty: 1
  },
  {
    id: "prob-008",
    question: "The standard deviation measures:",
    correctAnswer: "Spread or dispersion of data",
    incorrectAnswers: ["The average value", "The middle value", "The most common value"],
    category: "probability",
    difficulty: 1
  },
  {
    id: "prob-009",
    question: "What is the probability of flipping a fair coin and getting heads 3 times in a row?",
    correctAnswer: "1/8",
    incorrectAnswers: ["1/2", "1/4", "3/8"],
    category: "probability",
    difficulty: 1
  },
  {
    id: "prob-010",
    question: "In a normal distribution, approximately what percentage of data falls within one standard deviation of the mean?",
    correctAnswer: "68%",
    incorrectAnswers: ["50%", "95%", "99%"],
    category: "probability",
    difficulty: 2
  },
  {
    id: "prob-011",
    question: "The Law of Large Numbers states that as sample size increases:",
    correctAnswer: "Sample mean approaches population mean",
    incorrectAnswers: ["Variance increases", "Probability approaches 1", "All outcomes become equally likely"],
    category: "probability",
    difficulty: 2
  },
  {
    id: "prob-012",
    question: "What is P(A ∪ B) if A and B are mutually exclusive?",
    correctAnswer: "P(A) + P(B)",
    incorrectAnswers: ["P(A) × P(B)", "P(A) + P(B) - P(A∩B)", "P(A|B)"],
    category: "probability",
    difficulty: 2
  },
  {
    id: "prob-013",
    question: "The Gambler's Fallacy incorrectly assumes that:",
    correctAnswer: "Past random events affect future probabilities",
    incorrectAnswers: ["All gambles are fair", "The house always wins", "Random events are unpredictable"],
    category: "probability",
    difficulty: 2
  },
  {
    id: "prob-014",
    question: "How many ways can you choose 3 items from 10 distinct items (order doesn't matter)?",
    correctAnswer: "120",
    incorrectAnswers: ["720", "30", "1000"],
    category: "probability",
    difficulty: 2
  },
  {
    id: "prob-015",
    question: "The Central Limit Theorem states that sample means are approximately:",
    correctAnswer: "Normally distributed",
    incorrectAnswers: ["Uniformly distributed", "Exponentially distributed", "Poisson distributed"],
    category: "probability",
    difficulty: 2
  },
  {
    id: "prob-016",
    question: "If events A and B are independent, then P(A∩B) equals:",
    correctAnswer: "P(A) × P(B)",
    incorrectAnswers: ["P(A) + P(B)", "P(A|B)", "P(A) - P(B)"],
    category: "probability",
    difficulty: 2
  },
  {
    id: "prob-017",
    question: "The median of the set {1, 3, 3, 6, 7, 8, 9} is:",
    correctAnswer: "6",
    incorrectAnswers: ["3", "5.29", "7"],
    category: "probability",
    difficulty: 1
  },
  {
    id: "prob-018",
    question: "A Poisson distribution is used to model:",
    correctAnswer: "Rare events over a fixed interval",
    incorrectAnswers: ["Continuous measurements", "Binary outcomes", "Ranking data"],
    category: "probability",
    difficulty: 2
  },
  {
    id: "prob-019",
    question: "The correlation coefficient r ranges from:",
    correctAnswer: "-1 to 1",
    incorrectAnswers: ["0 to 1", "-∞ to ∞", "0 to 100"],
    category: "probability",
    difficulty: 2
  },
  {
    id: "prob-020",
    question: "Simpson's Paradox occurs when:",
    correctAnswer: "A trend reverses when data is aggregated",
    incorrectAnswers: ["Sample size is too small", "Variables are confounded", "Outliers skew the mean"],
    category: "probability",
    difficulty: 3
  },
  {
    id: "prob-021",
    question: "The variance of a random variable X is E[(X - μ)²]. What is the standard deviation?",
    correctAnswer: "√Var(X)",
    incorrectAnswers: ["Var(X)²", "Var(X)/n", "E[X²]"],
    category: "probability",
    difficulty: 2
  },
  {
    id: "prob-022",
    question: "A p-value in hypothesis testing represents:",
    correctAnswer: "Probability of observing results at least as extreme, given null hypothesis is true",
    incorrectAnswers: ["Probability the null hypothesis is true", "Probability of a Type I error", "The significance level"],
    category: "probability",
    difficulty: 3
  },
  {
    id: "prob-023",
    question: "In Bayesian statistics, what is updated based on evidence?",
    correctAnswer: "Prior probability to posterior probability",
    incorrectAnswers: ["Sample mean", "Significance level", "Null hypothesis"],
    category: "probability",
    difficulty: 2
  },
  {
    id: "prob-024",
    question: "The St. Petersburg Paradox involves a game with what kind of expected value?",
    correctAnswer: "Infinite",
    incorrectAnswers: ["Zero", "Negative", "Undefined"],
    category: "probability",
    difficulty: 3
  },
  {
    id: "prob-025",
    question: "What is the mode of the dataset {4, 1, 2, 4, 3, 4, 2}?",
    correctAnswer: "4",
    incorrectAnswers: ["2", "3", "2.86"],
    category: "probability",
    difficulty: 1
  },

  // =====================
  // MATH HISTORY (20)
  // =====================
  {
    id: "hist-001",
    question: "The ancient Babylonians used which number system?",
    correctAnswer: "Base 60 (sexagesimal)",
    incorrectAnswers: ["Base 10 (decimal)", "Base 2 (binary)", "Base 12 (duodecimal)"],
    category: "math-history",
    difficulty: 2
  },
  {
    id: "hist-002",
    question: "Which ancient civilization invented the concept of zero as a number?",
    correctAnswer: "Indian mathematicians",
    incorrectAnswers: ["Greek mathematicians", "Egyptian mathematicians", "Chinese mathematicians"],
    category: "math-history",
    difficulty: 2
  },
  {
    id: "hist-003",
    question: "The Rhind Mathematical Papyrus is from which ancient civilization?",
    correctAnswer: "Egypt",
    incorrectAnswers: ["Babylon", "Greece", "China"],
    category: "math-history",
    difficulty: 2
  },
  {
    id: "hist-004",
    question: "In what year was Fermat's Last Theorem finally proved?",
    correctAnswer: "1995",
    incorrectAnswers: ["1963", "2002", "1987"],
    category: "math-history",
    difficulty: 2
  },
  {
    id: "hist-005",
    question: "The Fields Medal, often called the 'Nobel Prize of Mathematics', is awarded every:",
    correctAnswer: "4 years",
    incorrectAnswers: ["Every year", "2 years", "5 years"],
    category: "math-history",
    difficulty: 2
  },
  {
    id: "hist-006",
    question: "Which famous mathematical conjecture was solved by Grigori Perelman in 2003?",
    correctAnswer: "The Poincaré Conjecture",
    incorrectAnswers: ["The Riemann Hypothesis", "The Goldbach Conjecture", "The Twin Prime Conjecture"],
    category: "math-history",
    difficulty: 2
  },
  {
    id: "hist-007",
    question: "The word 'algorithm' derives from the name of which mathematician?",
    correctAnswer: "Al-Khwarizmi",
    incorrectAnswers: ["Euclid", "Archimedes", "Fibonacci"],
    category: "math-history",
    difficulty: 2
  },
  {
    id: "hist-008",
    question: "In which century did Newton and Leibniz independently develop calculus?",
    correctAnswer: "17th century",
    incorrectAnswers: ["16th century", "18th century", "15th century"],
    category: "math-history",
    difficulty: 2
  },
  {
    id: "hist-009",
    question: "The symbol '=' for equality was introduced by:",
    correctAnswer: "Robert Recorde",
    incorrectAnswers: ["Leonhard Euler", "René Descartes", "Isaac Newton"],
    category: "math-history",
    difficulty: 3
  },
  {
    id: "hist-010",
    question: "Hilbert's famous list of 23 unsolved problems was presented in which year?",
    correctAnswer: "1900",
    incorrectAnswers: ["1850", "1920", "1875"],
    category: "math-history",
    difficulty: 2
  },
  {
    id: "hist-011",
    question: "The ancient Greeks proved that √2 is irrational. This was attributed to which school?",
    correctAnswer: "Pythagorean school",
    incorrectAnswers: ["Platonic Academy", "Lyceum", "Eleatic school"],
    category: "math-history",
    difficulty: 2
  },
  {
    id: "hist-012",
    question: "Which millennium problem was the first to be solved?",
    correctAnswer: "The Poincaré Conjecture",
    incorrectAnswers: ["The Riemann Hypothesis", "P vs NP", "The Navier-Stokes equations"],
    category: "math-history",
    difficulty: 2
  },
  {
    id: "hist-013",
    question: "The abacus is believed to have originated in:",
    correctAnswer: "Mesopotamia",
    incorrectAnswers: ["China", "Japan", "India"],
    category: "math-history",
    difficulty: 2
  },
  {
    id: "hist-014",
    question: "Leonardo Fibonacci introduced Hindu-Arabic numerals to Europe in which century?",
    correctAnswer: "13th century",
    incorrectAnswers: ["11th century", "15th century", "10th century"],
    category: "math-history",
    difficulty: 2
  },
  {
    id: "hist-015",
    question: "The first woman to receive a PhD in mathematics was:",
    correctAnswer: "Sofia Kovalevskaya",
    incorrectAnswers: ["Emmy Noether", "Ada Lovelace", "Sophie Germain"],
    category: "math-history",
    difficulty: 3
  },
  {
    id: "hist-016",
    question: "Euclid's 'Elements' was written around:",
    correctAnswer: "300 BCE",
    incorrectAnswers: ["500 BCE", "100 CE", "600 BCE"],
    category: "math-history",
    difficulty: 2
  },
  {
    id: "hist-017",
    question: "The Enigma machine, cracked by mathematicians in WWII, was primarily broken by a team at:",
    correctAnswer: "Bletchley Park",
    incorrectAnswers: ["MIT", "Cambridge University", "Princeton"],
    category: "math-history",
    difficulty: 2
  },
  {
    id: "hist-018",
    question: "Andrew Wiles proved Fermat's Last Theorem by proving which other conjecture?",
    correctAnswer: "The Taniyama-Shimura conjecture",
    incorrectAnswers: ["The Birch and Swinnerton-Dyer conjecture", "The Riemann Hypothesis", "The ABC conjecture"],
    category: "math-history",
    difficulty: 3
  },
  {
    id: "hist-019",
    question: "The mathematical constant π was first rigorously shown to be irrational by:",
    correctAnswer: "Johann Heinrich Lambert",
    incorrectAnswers: ["Leonhard Euler", "Archimedes", "Carl Lindemann"],
    category: "math-history",
    difficulty: 3
  },
  {
    id: "hist-020",
    question: "Which millennium problem has a $1 million prize for its solution?",
    correctAnswer: "All seven millennium problems",
    incorrectAnswers: ["Only the Riemann Hypothesis", "Only P vs NP", "Only the Navier-Stokes problem"],
    category: "math-history",
    difficulty: 2
  },

  // =====================
  // LOGIC PUZZLES (10)
  // =====================
  {
    id: "logic-001",
    question: "In propositional logic, 'P → Q' is equivalent to:",
    correctAnswer: "¬P ∨ Q",
    incorrectAnswers: ["P ∧ Q", "¬P ∧ Q", "P ∨ ¬Q"],
    category: "logic",
    difficulty: 2
  },
  {
    id: "logic-002",
    question: "The liar paradox 'This statement is false' demonstrates a problem with:",
    correctAnswer: "Self-reference",
    incorrectAnswers: ["Infinite regress", "Circular reasoning", "False dilemma"],
    category: "logic",
    difficulty: 2
  },
  {
    id: "logic-003",
    question: "In the Towers of Hanoi puzzle with n disks, the minimum number of moves required is:",
    correctAnswer: "2^n - 1",
    incorrectAnswers: ["n²", "2n", "n!"],
    category: "logic",
    difficulty: 2
  },
  {
    id: "logic-004",
    question: "Russell's Paradox concerns the set of all sets that:",
    correctAnswer: "Do not contain themselves",
    incorrectAnswers: ["Are infinite", "Are empty", "Contain only numbers"],
    category: "logic",
    difficulty: 3
  },
  {
    id: "logic-005",
    question: "In the hat puzzle, 3 people wear hats (2 black, 1 white). Each sees others but not their own. A wise person deduces their hat is black. What did they observe?",
    correctAnswer: "One black and one white hat",
    incorrectAnswers: ["Two white hats", "Two black hats", "Nothing - they guessed"],
    category: "logic",
    difficulty: 3
  },
  {
    id: "logic-006",
    question: "De Morgan's laws state that ¬(P ∧ Q) is equivalent to:",
    correctAnswer: "¬P ∨ ¬Q",
    incorrectAnswers: ["¬P ∧ ¬Q", "P ∨ Q", "¬(P ∨ Q)"],
    category: "logic",
    difficulty: 2
  },
  {
    id: "logic-007",
    question: "The 'halting problem' proved by Turing shows that:",
    correctAnswer: "No algorithm can determine if any program will halt",
    incorrectAnswers: ["All programs eventually halt", "Computers can solve any problem", "Infinite loops are always detectable"],
    category: "logic",
    difficulty: 3
  },
  {
    id: "logic-008",
    question: "In Boolean algebra, what is the result of 1 XOR 1?",
    correctAnswer: "0",
    incorrectAnswers: ["1", "2", "Undefined"],
    category: "logic",
    difficulty: 1
  },
  {
    id: "logic-009",
    question: "The contrapositive of 'If P then Q' is:",
    correctAnswer: "If not Q then not P",
    incorrectAnswers: ["If Q then P", "If not P then not Q", "P if and only if Q"],
    category: "logic",
    difficulty: 2
  },
  {
    id: "logic-010",
    question: "Gödel's First Incompleteness Theorem applies to any consistent formal system that:",
    correctAnswer: "Can express basic arithmetic",
    incorrectAnswers: ["Contains only true statements", "Is finite", "Has no axioms"],
    category: "logic",
    difficulty: 3
  }
] as const;

export const PUZZLE_COUNT = MATH_PUZZLES.length;
