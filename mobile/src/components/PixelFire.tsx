import React, { useEffect, useRef, useMemo } from "react";
import { View, Animated, StyleSheet, Easing } from "react-native";

interface PixelFireProps {
  width: number;
  height: number;
  cardTranslateX: Animated.Value;
  cardTranslateY: Animated.Value;
}

type Edge = "top" | "bottom" | "left" | "right";

interface ParticleConfig {
  x: number;
  y: number;
  color: string;
  size: number;
  delay: number;
  duration: number;
  driftX: number;
  driftY: number;
  maxOpacity: number;
}

const BASE_COLOR = "#FA8057";
const MID_COLOR = "#FAD009";
const TIP_COLOR = "#ED2EA5";

function colorForLayer(layer: number, layers: number): string {
  const t = layer / (layers - 1 || 1);
  if (t < 0.5) return Math.random() < 0.7 ? BASE_COLOR : MID_COLOR;
  if (t < 0.8) return Math.random() < 0.6 ? MID_COLOR : BASE_COLOR;
  return Math.random() < 0.5 ? TIP_COLOR : MID_COLOR;
}

function generateParticles(width: number, height: number): ParticleConfig[] {
  const particles: ParticleConfig[] = [];
  const PX = 5;

  const tongues: { edge: Edge; ax: number; ay: number; layers: number }[] = [];

  const topCount = 8;
  for (let i = 0; i < topCount; i++) {
    tongues.push({
      edge: "top",
      ax: (width / (topCount + 1)) * (i + 1) + (Math.random() - 0.5) * 14,
      ay: 0,
      layers: 3 + Math.floor(Math.random() * 2),
    });
  }
  for (const edge of ["left", "right"] as Edge[]) {
    const count = 5;
    for (let i = 0; i < count; i++) {
      tongues.push({
        edge,
        ax: edge === "left" ? 0 : width,
        ay: (height / (count + 1)) * (i + 1) + (Math.random() - 0.5) * 12,
        layers: 2 + Math.floor(Math.random() * 2),
      });
    }
  }
  const botCount = 3;
  for (let i = 0; i < botCount; i++) {
    tongues.push({
      edge: "bottom",
      ax: (width / (botCount + 1)) * (i + 1) + (Math.random() - 0.5) * 14,
      ay: height,
      layers: 2 + Math.floor(Math.random() * 2),
    });
  }

  for (const { edge, ax, ay, layers } of tongues) {
    const baseDelay = Math.random() * 500;
    const duration = 500 + Math.random() * 500;

    for (let layer = 0; layer < layers; layer++) {
      const t = layer / (layers - 1 || 1);
      const cols = t < 0.5 ? 2 : 1;
      const size = PX - t * 2;

      for (let col = 0; col < cols; col++) {
        const lat = (col - (cols - 1) / 2) * PX;
        let x = ax, y = ay;

        switch (edge) {
          case "top":
            x += lat + (Math.random() - 0.5) * 2;
            y = -layer * PX + (Math.random() - 0.5) * 2;
            break;
          case "bottom":
            x += lat + (Math.random() - 0.5) * 2;
            y = ay + layer * PX * 0.5 - PX + (Math.random() - 0.5) * 2;
            break;
          case "left":
            x = -layer * PX + (Math.random() - 0.5) * 2;
            y += lat + (Math.random() - 0.5) * 2;
            break;
          case "right":
            x = ax + layer * PX * 0.5 - PX + (Math.random() - 0.5) * 2;
            y += lat + (Math.random() - 0.5) * 2;
            break;
        }

        let driftX = (Math.random() - 0.5) * 4;
        let driftY = -(6 + Math.random() * 10 + t * 6);
        if (edge === "left") driftX -= 3 + Math.random() * 4;
        if (edge === "right") driftX += 3 + Math.random() * 4;
        if (edge === "bottom") driftY = -(8 + Math.random() * 6);

        particles.push({
          x, y,
          size: Math.max(2, size),
          color: colorForLayer(layer, layers),
          delay: baseDelay + layer * 40 + Math.random() * 80,
          duration: duration + t * 200,
          driftX, driftY,
          maxOpacity: 0.8 - t * 0.35,
        });
      }
    }
  }

  return particles;
}

// Memoized particle — never re-renders after mount
const Particle = React.memo(function Particle({
  config,
  cardPosRef,
}: {
  config: ParticleConfig;
  cardPosRef: React.MutableRefObject<{ x: number; y: number }>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const driftX = useRef(new Animated.Value(0)).current;
  const driftY = useRef(new Animated.Value(0)).current;
  const baseX = useRef(new Animated.Value(0)).current;
  const baseY = useRef(new Animated.Value(0)).current;

  const totalX = useRef(Animated.add(baseX, driftX)).current;
  const totalY = useRef(Animated.add(baseY, driftY)).current;

  useEffect(() => {
    let cancelled = false;
    let currentAnim: Animated.CompositeAnimation | null = null;

    const animate = () => {
      if (cancelled) return;

      baseX.setValue(cardPosRef.current.x);
      baseY.setValue(cardPosRef.current.y);
      driftX.setValue(0);
      driftY.setValue(0);
      opacity.setValue(0);

      currentAnim = Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: config.maxOpacity,
            duration: config.duration * 0.25,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: config.duration * 0.75,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(driftX, {
          toValue: config.driftX,
          duration: config.duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(driftY, {
          toValue: config.driftY,
          duration: config.duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);
      currentAnim.start(({ finished }) => {
        if (finished && !cancelled) animate();
      });
    };

    const timeout = setTimeout(animate, config.delay);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      currentAnim?.stop();
    };
  }, []);

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: config.size,
          height: config.size,
          backgroundColor: config.color,
          left: config.x,
          top: config.y,
          opacity,
          transform: [
            { translateX: totalX as unknown as number },
            { translateY: totalY as unknown as number },
          ],
        },
      ]}
    />
  );
});

// Memoized container — only re-renders if width/height change
const PixelFire = React.memo(function PixelFire({
  width,
  height,
  cardTranslateX,
  cardTranslateY,
}: PixelFireProps) {
  // Particles generated once and never remounted across card changes.
  // They naturally pick up the new card position via cardPosRef on their next cycle.
  const particles = useMemo(
    () => generateParticles(width, height),
    [width, height]
  );

  const cardPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const xId = cardTranslateX.addListener(({ value }) => {
      cardPosRef.current.x = value;
    });
    const yId = cardTranslateY.addListener(({ value }) => {
      cardPosRef.current.y = value;
    });
    return () => {
      cardTranslateX.removeListener(xId);
      cardTranslateY.removeListener(yId);
    };
  }, [cardTranslateX, cardTranslateY]);

  return (
    <View style={[styles.container, { width, height }]} pointerEvents="none">
      {particles.map((p, i) => (
        <Particle key={i} config={p} cardPosRef={cardPosRef} />
      ))}
    </View>
  );
});

export default PixelFire;

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
