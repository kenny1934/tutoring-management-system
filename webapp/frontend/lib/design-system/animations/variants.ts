/**
 * Standardized Framer Motion animation variants for CSM Pro
 * Following design system timing and easing specifications
 */

import { Variants } from "framer-motion";

/**
 * Page transition animations
 */
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  enter: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1], // Custom ease-out
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: {
      duration: 0.3,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

/**
 * Modal/Drawer animations with backdrop blur
 */
export const modalVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.25,
      ease: [0.34, 1.56, 0.64, 1], // Spring ease
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: {
      duration: 0.2,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

/**
 * Card hover and tap animations
 */
export const cardVariants: Variants = {
  rest: {
    scale: 1,
    y: 0,
  },
  hover: {
    scale: 1.02,
    y: -4,
    transition: {
      duration: 0.2,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  tap: {
    scale: 0.98,
    transition: {
      duration: 0.15,
    },
  },
};

/**
 * Stagger list animations
 */
export const listContainerVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

export const listItemVariants: Variants = {
  hidden: {
    opacity: 0,
    x: -10,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.3,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

/**
 * Expandable section animations
 */
export const expandVariants: Variants = {
  collapsed: {
    height: 0,
    opacity: 0,
    transition: {
      duration: 0.25,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  expanded: {
    height: "auto",
    opacity: 1,
    transition: {
      duration: 0.3,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

/**
 * Button animations (press, hover, loading)
 */
export const buttonVariants: Variants = {
  rest: {
    scale: 1,
  },
  hover: {
    scale: 1.02,
    transition: {
      duration: 0.15,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  tap: {
    scale: 0.95,
    transition: {
      duration: 0.1,
    },
  },
};

/**
 * Fade in animation
 */
export const fadeInVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.25,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

/**
 * Slide up animation (bottom to top)
 */
export const slideUpVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

/**
 * Slide down animation (top to bottom)
 */
export const slideDownVariants: Variants = {
  hidden: {
    opacity: 0,
    y: -20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

/**
 * Scale in animation with spring
 */
export const scaleInVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.34, 1.56, 0.64, 1], // Spring
    },
  },
};

/**
 * Toast/notification slide in from right
 */
export const toastVariants: Variants = {
  hidden: {
    x: "100%",
    opacity: 0,
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30,
    },
  },
  exit: {
    x: "100%",
    opacity: 0,
    transition: {
      duration: 0.2,
    },
  },
};

/**
 * Loading spinner rotation
 */
export const spinnerVariants: Variants = {
  animate: {
    rotate: 360,
    transition: {
      duration: 1,
      ease: "linear",
      repeat: Infinity,
    },
  },
};

/**
 * Pulse animation (for loading states)
 */
export const pulseVariants: Variants = {
  animate: {
    opacity: [1, 0.5, 1],
    transition: {
      duration: 1.5,
      ease: "easeInOut",
      repeat: Infinity,
    },
  },
};
