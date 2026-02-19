import React, { useEffect, useRef, useMemo } from "react";
import { View, Animated, StyleSheet } from "react-native";

interface PixelFireProps {
  width: number;
  height: number;
  particleCount?: number;
  particleSize?: number;
}

type Edge = "top" | "bottom" | "left" | "right";

interface ParticleConfig {
  edge: Edge;
  x: number;
  y: number;
  color: string;
  delay: number;
  duration: number;
  drift: number;
}

const COLORS: { color: string; weight: number }[] = [
  { color: "#FA8057", weight: 0.5 },  // orange (most common)
  { color: "#FAD009", weight: 0.3 },  // yellow (mid)
  { color: "#ED2EA5", weight: 0.2 },  // pink (rare)
];

function pickColor(): string {
  const r = Math.random();
  if (r < COLORS[0].weight) return COLORS[0].color;
  if (r < COLORS[0].weight + COLORS[1].weight) return COLORS[1].color;
  return COLORS[2].color;
}

function generateParticles(
  width: number,
  height: number,
  particleCount: number,
  particleSize: number
): ParticleConfig[] {
  const particles: ParticleConfig[] = [];
  const perEdge = Math.ceil(particleCount / 4);
  const edges: Edge[] = ["top", "bottom", "left", "right"];

  for (const edge of edges) {
    for (let i = 0; i < perEdge; i++) {
      const jitter = (Math.random() - 0.5) * particleSize * 2;
      let x = 0;
      let y = 0;

      switch (edge) {
        case "top":
          x = Math.random() * (width - particleSize);
          y = jitter;
          break;
        case "bottom":
          x = Math.random() * (width - particleSize);
          y = height - particleSize + jitter;
          break;
        case "left":
          x = jitter;
          y = Math.random() * (height - particleSize);
          break;
        case "right":
          x = width - particleSize + jitter;
          y = Math.random() * (height - particleSize);
          break;
      }

      particles.push({
        edge,
        x,
        y,
        color: pickColor(),
        delay: Math.random() * 600,
        duration: 300 + Math.random() * 500,
        drift: 2 + Math.random() * 2,
      });
    }
  }

  return particles;
}

function Particle({ config, size }: { config: ParticleConfig; size: number }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const maxOpacity = 0.6 + Math.random() * 0.2;

    const animate = () => {
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: maxOpacity,
          duration: config.duration,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: config.duration,
          useNativeDriver: true,
        }),
      ]).start(() => animate());
    };

    const timeout = setTimeout(animate, config.delay);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: size,
          height: size,
          backgroundColor: config.color,
          left: config.x,
          top: config.y,
          opacity,
        },
      ]}
    />
  );
}

export default function PixelFire({
  width,
  height,
  particleCount = 48,
  particleSize = 4,
}: PixelFireProps) {
  const particles = useMemo(
    () => generateParticles(width, height, particleCount, particleSize),
    [width, height, particleCount, particleSize]
  );

  return (
    <View style={[styles.container, { width, height }]} pointerEvents="none">
      {particles.map((p, i) => (
        <Particle key={i} config={p} size={particleSize} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    overflow: "visible",
  },
  particle: {
    position: "absolute",
    borderRadius: 1,
  },
});
