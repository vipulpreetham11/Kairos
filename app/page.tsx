'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Globe } from '../components/Globe';

export default function LandingPage() {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const countUpObserverRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.animate-on-scroll').forEach(el => {
      observerRef.current?.observe(el);
    });

    countUpObserverRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const target = entry.target as HTMLElement;
          if (target.classList.contains('counted')) return;
          
          const endVal = parseInt(target.getAttribute('data-value') || '0', 10);
          const duration = 2000;
          const start = performance.now();
          
          const step = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 4);
            const current = Math.floor(easeProgress * endVal);
            
            target.innerText = current.toString();
            
            if (progress < 1) {
              window.requestAnimationFrame(step);
            } else {
              target.innerText = endVal.toString();
              target.classList.add('counted');
            }
          };
          window.requestAnimationFrame(step);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.count-up').forEach(el => {
      countUpObserverRef.current?.observe(el);
    });

    return () => {
      observerRef.current?.disconnect();
      countUpObserverRef.current?.disconnect();
    };
  }, []);

  const marqueeItems = (
    <>
      <span className="highlight">BUILT AT OPENAI &times; OUTSKILL AI BUILDERS</span>
      <span className="dot">✦</span>
      <span>NEXT.JS 14</span>
      <span className="dot">✦</span>
      <span>SUPABASE</span>
      <span className="dot">✦</span>
      <span>GROQ</span>
      <span className="dot">✦</span>
      <span>OPENAI</span>
      <span className="dot">✦</span>
      <span>VERCEL</span>
      <span className="dot">✦</span>
    </>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        :root {
          --bg: #FFFFFF;
          --card-bg: #0F172A;
          --card-text: #FAFAFA;
          --accent: #2563EB;
          --border: #E2E8F0;
          --text-primary: #0F172A;
          --text-secondary: #64748B;
          --card-border: #1E293B;
          --section-alt: #F8FAFC;
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: 'Inter', sans-serif;
          background-color: var(--bg);
          color: var(--text-primary);
          line-height: 1.5;
          overflow-x: hidden;
        }

        a {
          text-decoration: none;
          color: inherit;
        }

        .container {
          max-width: 1280px; /* Slightly wider for a bigger feel */
          margin: 0 auto;
          padding: 0 32px;
        }

        /* Navbar */
        .navbar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
          z-index: 100;
          height: 80px;
          display: flex;
          align-items: center;
        }

        .nav-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }

        .logo {
          font-weight: 800;
          font-size: 24px;
          color: var(--text-primary);
          letter-spacing: -0.5px;
        }

        .btn-primary {
          background-color: var(--accent);
          color: #fff;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          transition: all 0.2s;
        }
        
        .btn-primary:hover {
          opacity: 0.9;
          transform: translateY(-2px);
          box-shadow: 0 10px 20px -10px var(--accent);
        }

        /* Hero */
        .hero {
          padding: 200px 0 100px;
        }

        .hero-label {
          font-family: monospace;
          font-size: 14px;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-bottom: 32px;
          display: block;
        }

        .hero-title {
          font-size: 72px;
          font-weight: 800;
          color: var(--text-primary);
          line-height: 1.05;
          letter-spacing: -3px;
          margin-bottom: 32px;
          max-width: 800px;
        }

        .hero-subtitle {
          font-size: 22px;
          color: var(--text-secondary);
          max-width: 600px;
          margin-bottom: 48px;
          line-height: 1.6;
        }

        .hero-content-wrapper {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 40px;
          margin-bottom: 100px;
        }

        .hero-left {
          flex: 1;
        }

        .hero-actions {
          display: flex;
          gap: 20px;
        }

        .hero-right {
          flex: 1;
          display: none;
          justify-content: flex-end;
          align-items: center;
          position: relative;
        }
        @media (min-width: 1024px) {
          .hero-right {
            display: flex;
          }
        }

        .glass-stack {
          position: relative;
          width: 400px;
          height: 380px;
        }

        .glass-card {
          position: absolute;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.8);
          box-shadow: 0 30px 60px -15px rgba(0,0,0,0.1);
          border-radius: 16px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          width: 320px;
          animation: levitate 6s ease-in-out infinite;
        }

        .glass-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
        }

        .glass-text {
          display: flex;
          flex-direction: column;
        }

        .glass-text strong {
          color: var(--text-primary);
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.3px;
        }

        .glass-text span {
          color: var(--text-secondary);
          font-size: 13px;
        }

        .card-1 {
          top: 0;
          left: 60px;
          z-index: 3;
          animation-delay: 0s;
        }

        .card-2 {
          top: 110px;
          left: 0;
          z-index: 2;
          animation-delay: -2s;
        }

        .card-3 {
          top: 220px;
          left: 80px;
          z-index: 1;
          animation-delay: -4s;
        }

        @keyframes levitate {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-15px); }
        }


        .btn-large {
          padding: 16px 32px;
          font-size: 18px;
          border-radius: 8px;
        }

        .btn-secondary {
          border: 2px solid var(--border);
          color: var(--text-secondary);
          font-weight: 600;
          background: transparent;
          transition: all 0.2s;
        }

        .btn-secondary:hover {
          color: var(--text-primary);
          border-color: #cbd5e1;
          transform: translateY(-2px);
        }

        /* Metrics (4 Boxes) */
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }

        .metric-item {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 40px 24px;
          box-shadow: 0 20px 40px -20px rgba(0,0,0,0.05);
          transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .metric-item::before {
          content: "";
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 4px;
          background: var(--accent);
          opacity: 0;
          transition: opacity 0.3s;
        }

        .metric-item:hover {
          transform: translateY(-8px);
          border-color: var(--accent);
          box-shadow: 0 30px 60px -20px rgba(37, 99, 235, 0.15);
        }

        .metric-item:hover::before {
          opacity: 1;
        }

        .metric-value {
          font-size: 56px;
          font-weight: 800;
          color: var(--text-primary);
          margin-bottom: 8px;
          letter-spacing: -2px;
          line-height: 1;
        }

        .metric-label {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        /* Social Proof (Marquee) */
        .marquee-container {
          overflow: hidden;
          background-color: var(--card-bg);
          padding: 16px 0;
          border-top: 1px solid var(--card-border);
          border-bottom: 1px solid var(--card-border);
          display: flex;
          position: relative;
        }

        .marquee-container::before,
        .marquee-container::after {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          width: 120px;
          z-index: 2;
          pointer-events: none;
        }
        
        .marquee-container::before {
          left: 0;
          background: linear-gradient(to right, var(--card-bg), transparent);
        }

        .marquee-container::after {
          right: 0;
          background: linear-gradient(to left, var(--card-bg), transparent);
        }

        .marquee-track {
          display: flex;
          width: max-content;
          animation: scrollLeft 40s linear infinite;
        }

        .marquee-content {
          display: flex;
          align-items: center;
          gap: 40px;
          padding: 0 20px;
          font-family: monospace;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 2px;
          white-space: nowrap;
          color: #94A3B8;
        }

        .marquee-content span.highlight {
          color: #FAFAFA;
          font-weight: 700;
          text-shadow: 0 0 12px rgba(255,255,255,0.2);
        }

        .marquee-content span.dot {
          color: var(--accent);
          font-size: 14px;
        }

        @keyframes scrollLeft {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }

        /* Problem Section */
        .section {
          padding: 140px 0;
        }

        .section-label {
          font-family: monospace;
          font-size: 14px;
          color: var(--accent);
          text-transform: uppercase;
          margin-bottom: 24px;
          display: block;
          font-weight: 600;
          letter-spacing: 1px;
        }

        .section-title {
          font-size: 56px;
          font-weight: 800;
          color: var(--text-primary);
          line-height: 1.1;
          letter-spacing: -2px;
          margin-bottom: 80px;
          max-width: 800px;
        }

        .cards-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 32px;
        }

        /* Problem Cards */
        .problem-card {
          background-color: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-top: 4px solid var(--accent);
          border-radius: 16px;
          padding: 40px;
          color: #0F172A;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .problem-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }

        .card-label {
          font-family: monospace;
          font-size: 12px;
          color: var(--accent);
          margin-bottom: 32px;
          display: block;
          letter-spacing: 1px;
          font-weight: 700;
          background: #EFF6FF;
          width: fit-content;
          padding: 6px 12px;
          border-radius: 6px;
        }

        .card-stat {
          font-size: 64px;
          font-weight: 800;
          color: #0F172A;
          line-height: 1;
          margin-bottom: 12px;
          letter-spacing: -2px;
        }

        .card-substat {
          font-size: 16px;
          color: #475569;
          margin-bottom: 32px;
          font-weight: 600;
        }

        .card-body {
          font-size: 16px;
          color: #64748B;
          line-height: 1.7;
        }

        /* Widget Cards (Solution) */
        .widget-card {
          background-color: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          padding: 32px;
          color: #0F172A;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          display: flex;
          flex-direction: column;
        }

        .widget-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }

        .widget-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
        }

        .widget-role {
          font-family: monospace;
          font-size: 12px;
          color: var(--text-secondary);
          font-weight: 600;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .widget-title {
          font-size: 20px;
          font-weight: 800;
          color: #0F172A;
          margin-bottom: 24px;
          letter-spacing: -0.5px;
        }

        .widget-metric {
          font-size: 48px;
          font-weight: 800;
          line-height: 1;
          margin-bottom: 12px;
          letter-spacing: -1.5px;
        }

        .metric-red { color: #DC2626; }
        .metric-green { color: #16A34A; }

        .widget-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .badge-critical {
          background-color: #FEF2F2;
          color: #DC2626;
          border: 1px solid #FCA5A5;
        }

        .badge-success {
          background-color: #F0FDF4;
          color: #16A34A;
          border: 1px solid #86EFAC;
        }

        .widget-content {
          font-size: 15px;
          color: #475569;
          line-height: 1.6;
          flex-grow: 1;
        }

        .widget-actions {
          margin-top: 24px;
          display: flex;
          gap: 12px;
        }

        .btn-widget {
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-widget-primary {
          background-color: var(--accent);
          color: #fff;
          border: none;
        }

        .btn-widget-primary:hover {
          background-color: #1D4ED8;
        }

        .btn-widget-outline {
          background-color: transparent;
          color: #475569;
          border: 1px solid #CBD5E1;
        }

        .btn-widget-outline:hover {
          background-color: #F8FAFC;
          color: #0F172A;
        }

        .student-list-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 0;
          border-top: 1px solid #F1F5F9;
        }

        .student-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #F1F5F9;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          color: #64748B;
        }

        .student-info {
          flex-grow: 1;
        }
        
        .student-name {
          font-size: 15px;
          font-weight: 700;
          color: #0F172A;
          margin-bottom: 2px;
        }
        
        .student-sub {
          font-size: 13px;
          color: #64748B;
        }

        .student-score {
          font-size: 24px;
          font-weight: 800;
          color: #DC2626;
          letter-spacing: -0.5px;
        }

        /* Solution Section */
        .solution-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 32px;
        }

        /* Architecture Section */
        .architecture-section {
          background-color: var(--section-alt);
        }

        .arch-diagram {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 48px;
          padding: 40px 0;
          width: 100%;
        }

        .arch-row {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
          justify-content: center;
          position: relative;
        }

        .arch-box {
          background-color: var(--card-bg);
          border: 1px solid var(--card-border);
          padding: 16px 0;
          width: 140px;
          text-align: center;
          border-radius: 8px;
          font-family: monospace;
          font-size: 15px;
          font-weight: 600;
          color: #fff;
          z-index: 2;
          box-shadow: 0 10px 20px rgba(0,0,0,0.1);
          transition: all 0.3s ease;
          cursor: default;
        }

        .arch-box:not(.engine):hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 30px rgba(37, 99, 235, 0.3);
          border-color: var(--accent);
        }

        .arch-box.engine {
          border-color: var(--accent);
          padding: 24px 0;
          width: 400px;
          text-align: center;
          border-width: 2px;
          box-shadow: 0 0 30px rgba(37, 99, 235, 0.2);
          animation: pulse-glow 3s ease-in-out infinite;
        }

        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(37, 99, 235, 0.2); }
          50% { box-shadow: 0 0 60px rgba(37, 99, 235, 0.5); }
        }

        .arch-arrow {
          display: none;
          width: 2px;
          height: 60px;
          background-color: var(--border);
          margin: 0 auto;
          position: relative;
          overflow: hidden;
        }

        .arch-arrow::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(to bottom, transparent 0%, var(--accent) 50%, transparent 100%);
          animation: flow-down 2s linear infinite;
        }

        @keyframes flow-down {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }

        .arch-svg-arrows {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 1;
          pointer-events: none;
        }

        .svg-pulse path {
          stroke-dasharray: 20 250;
          stroke-dashoffset: 20;
          stroke-linecap: round;
          animation: svg-pulse-anim 3s linear infinite;
          filter: drop-shadow(0 0 4px rgba(37,99,235,0.8));
        }

        @keyframes svg-pulse-anim {
          0% { stroke-dashoffset: 20; }
          100% { stroke-dashoffset: -250; }
        }

        .svg-pulse path:nth-child(1) { animation-delay: 0s; }
        .svg-pulse path:nth-child(2) { animation-delay: 0.3s; }
        .svg-pulse path:nth-child(3) { animation-delay: 0.6s; }
        .svg-pulse path:nth-child(4) { animation-delay: 0.9s; }
        .svg-pulse path:nth-child(5) { animation-delay: 1.2s; }
        .svg-pulse path:nth-child(6) { animation-delay: 1.5s; }
        .svg-pulse path:nth-child(7) { animation-delay: 1.8s; }
        .svg-pulse path:nth-child(8) { animation-delay: 2.1s; }
        .svg-pulse path:nth-child(9) { animation-delay: 2.4s; }
        .svg-pulse path:nth-child(10) { animation-delay: 2.7s; }
        /* Tech Stack */
        .tech-columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 80px;
          align-items: center;
        }
        
        .tech-text {
          font-size: 20px;
          color: var(--text-secondary);
          line-height: 1.7;
        }

        .tech-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
        }

        .tech-badge {
          background-color: var(--card-bg);
          color: #FAFAFA;
          padding: 10px 20px;
          border-radius: 8px;
          font-family: monospace;
          font-size: 15px;
          border: 1px solid var(--card-border);
          font-weight: 600;
          box-shadow: 0 10px 20px rgba(0,0,0,0.1);
          transition: box-shadow 0.3s ease, border-color 0.3s ease, color 0.3s ease;
          animation: float-badge 6s ease-in-out infinite;
          cursor: default;
        }

        .tech-badge:hover {
          box-shadow: 0 15px 30px rgba(37, 99, 235, 0.4);
          border-color: var(--accent);
          color: var(--accent);
        }

        @keyframes float-badge {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }

        .tech-badge:nth-child(1) { animation-delay: 0s; }
        .tech-badge:nth-child(2) { animation-delay: -1s; }
        .tech-badge:nth-child(3) { animation-delay: -3s; }
        .tech-badge:nth-child(4) { animation-delay: -2s; }
        .tech-badge:nth-child(5) { animation-delay: -4s; }
        .tech-badge:nth-child(6) { animation-delay: -1.5s; }
        .tech-badge:nth-child(7) { animation-delay: -2.5s; }
        .tech-badge:nth-child(8) { animation-delay: -0.5s; }
        .tech-badge:nth-child(9) { animation-delay: -3.5s; }
        .tech-badge:nth-child(10) { animation-delay: -4.5s; }

        /* Final CTA */
        .cta-section {
          padding: 120px 0;
          background-color: var(--bg);
        }

        .cta-panel {
          position: relative;
          background: linear-gradient(180deg, #0F172A 0%, #020617 100%);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 32px;
          padding: 120px 40px;
          text-align: center;
          overflow: hidden;
          box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.3);
        }

        .cta-glow {
          position: absolute;
          top: -50%;
          left: 50%;
          transform: translateX(-50%);
          width: 800px;
          height: 800px;
          background: radial-gradient(circle, rgba(37,99,235,0.2) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }

        .cta-title {
          position: relative;
          z-index: 1;
          font-size: 72px;
          font-weight: 800;
          color: #fff;
          margin-bottom: 24px;
          letter-spacing: -2px;
          line-height: 1.1;
        }

        .text-gradient {
          background: linear-gradient(135deg, #60A5FA, #3B82F6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .cta-sub {
          position: relative;
          z-index: 1;
          font-size: 24px;
          color: #94A3B8;
          margin-bottom: 48px;
        }

        .btn-cta {
          position: relative;
          z-index: 1;
          display: inline-block;
          font-size: 20px;
          padding: 20px 48px;
          border-radius: 12px;
          background: var(--accent);
          color: white;
          font-weight: 600;
          box-shadow: 0 15px 30px -10px rgba(37, 99, 235, 0.6);
          transition: all 0.3s ease;
        }

        .btn-cta:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 40px -10px rgba(37, 99, 235, 0.8);
          opacity: 1;
        }

        .demo-credentials {
          position: relative;
          z-index: 1;
          margin-top: 56px;
          padding: 32px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          display: inline-block;
          text-align: left;
          backdrop-filter: blur(10px);
        }

        .demo-credentials-title {
          font-size: 14px;
          color: #94A3B8;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-bottom: 24px;
          text-align: center;
          font-weight: 700;
        }

        .credentials-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }
        @media (min-width: 768px) {
          .credentials-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .credentials-grid {
            grid-template-columns: repeat(5, 1fr);
          }
        }

        .cred-item {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-family: monospace;
          background: rgba(255, 255, 255, 0.03);
          padding: 16px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          transition: border-color 0.2s;
        }

        .cred-item:hover {
          border-color: rgba(37, 99, 235, 0.5);
        }

        .cred-role {
          color: #60A5FA;
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .cred-email {
          color: #F8FAFC;
          font-size: 14px;
        }

        .cred-pass {
          color: #94A3B8;
          font-size: 13px;
        }

        .cta-footer {
          position: relative;
          z-index: 1;
          margin-top: 64px;
          font-size: 15px;
          color: #475569;
          font-weight: 500;
        }

        /* Footer */
        .footer {
          border-top: 1px solid var(--border);
          padding: 40px 0;
          text-align: center;
          font-size: 15px;
          color: #94A3B8;
          font-weight: 500;
        }

        /* Animations */
        .animate-on-scroll {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .animate-on-scroll.visible {
          opacity: 1;
          transform: translateY(0);
        }

        .stagger-1 { transition-delay: 100ms; }
        .stagger-2 { transition-delay: 200ms; }
        .stagger-3 { transition-delay: 300ms; }
        .stagger-4 { transition-delay: 400ms; }
        .stagger-5 { transition-delay: 500ms; }

        @media (max-width: 1024px) {
          .metrics-grid { grid-template-columns: repeat(2, 1fr); }
          .cards-row { grid-template-columns: 1fr; }
          .tech-columns { grid-template-columns: 1fr; gap: 48px; }
          .arch-svg-arrows { display: none; }
          .arch-arrow { display: block; }
          .arch-box { width: 120px; font-size: 13px; }
          .arch-box.engine { width: 100%; }
        }

        @media (max-width: 768px) {
          .hero-title { font-size: 48px; }
          .section-title { font-size: 40px; }
          .cta-title { font-size: 40px; }
          .metrics-grid { grid-template-columns: 1fr; }
          .arch-row { flex-direction: column; align-items: center; }
          .marquee-content { font-size: 20px; gap: 32px; padding: 0 16px; }
          .card-stat { font-size: 56px; }
          .hero-actions { flex-direction: column; }
        }
      `}} />

      <nav className="navbar">
        <div className="container nav-content">
          <div className="logo">Kairos</div>
          <Link href="/login" className="btn-primary">Open App &rarr;</Link>
        </div>
      </nav>

      <section className="hero container animate-on-scroll">
        <div className="hero-content-wrapper">
          <div className="hero-left">
            <span className="hero-label">AI Intelligence Layer &middot; Indian Schools</span>
            <h1 className="hero-title">The AI Brain Behind<br/>Your School's Decisions.</h1>
            <p className="hero-subtitle">
              Kairos reads attendance, fees, marks, and homework across 600+ students and tells each role exactly what to act on &mdash; before problems become crises.
            </p>
            <div className="hero-actions">
              <Link href="https://kairos.vipulpreetham.me" className="btn-primary btn-large">Open Kairos &rarr;</Link>
              <a href="https://github.com/vipulpreetham11/kairos" target="_blank" rel="noopener noreferrer" className="btn-secondary btn-large">View on GitHub</a>
            </div>
          </div>
          
          <div className="hero-right" style={{height: '500px', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
            <Globe size={500} dotColor="rgba(37, 99, 235, ALPHA)" arcColor="rgba(37, 99, 235, 0.5)" markerColor="rgba(37, 99, 235, 1)" />
          </div>
        </div>

        <div className="metrics-grid animate-on-scroll stagger-1">
          <div className="metric-item">
            <div className="metric-value"><span className="count-up" data-value="600">0</span>+</div>
            <div className="metric-label">Students analyzed</div>
          </div>
          <div className="metric-item">
            <div className="metric-value"><span className="count-up" data-value="5">0</span></div>
            <div className="metric-label">Roles dashboard</div>
          </div>
          <div className="metric-item">
            <div className="metric-value"><span className="count-up" data-value="30">0</span>+</div>
            <div className="metric-label">Tables in schema</div>
          </div>
          <div className="metric-item">
            <div className="metric-value">&lt;<span className="count-up" data-value="2">0</span>s</div>
            <div className="metric-label">Insights generated</div>
          </div>
        </div>
      </section>

      <div className="marquee-container">
        <div className="marquee-track">
          <div className="marquee-content">{marqueeItems}</div>
          <div className="marquee-content" aria-hidden="true">{marqueeItems}</div>
          <div className="marquee-content" aria-hidden="true">{marqueeItems}</div>
          <div className="marquee-content" aria-hidden="true">{marqueeItems}</div>
        </div>
      </div>

      <section className="section container">
        <span className="section-label animate-on-scroll">THE PROBLEM</span>
        <h2 className="section-title animate-on-scroll stagger-1">Schools have data.<br/>Nobody's reading it.</h2>
        
        <div className="cards-row">
          <div className="problem-card animate-on-scroll stagger-1">
            <span className="card-label">PRINCIPAL</span>
            <div className="card-stat">67%</div>
            <div className="card-substat">of dropout signals</div>
            <div className="card-body">
              visible in data 3 weeks before<br/>the student actually leaves.
            </div>
          </div>
          
          <div className="problem-card animate-on-scroll stagger-2">
            <span className="card-label">ACCOUNTANT</span>
            <div className="card-stat">&#8377;2.3L</div>
            <div className="card-substat">average term revenue</div>
            <div className="card-body">
              lost per school to fee defaults<br/>that were predictable.
            </div>
          </div>

          <div className="problem-card animate-on-scroll stagger-3">
            <span className="card-label">PARENT</span>
            <div className="card-stat">2x</div>
            <div className="card-substat">per year</div>
            <div className="card-body">
              How often a parent hears from<br/>the school. Report cards.
            </div>
          </div>
        </div>
      </section>

      <section className="section container">
        <span className="section-label animate-on-scroll">THE SOLUTION</span>
        <h2 className="section-title animate-on-scroll stagger-1">Everything You Need To<br/>Read Your School</h2>
        
        <div className="solution-grid">
          <div className="widget-card animate-on-scroll stagger-1">
            <div className="widget-header">
              <span className="widget-role">OWNER</span>
              <span className="widget-badge badge-success">On Track</span>
            </div>
            <h3 className="widget-title">Revenue Intelligence</h3>
            <div className="widget-metric metric-green">69.4%</div>
            <div className="widget-content" style={{marginBottom: '16px'}}>
              Fee collection rate for current term. Forecasted to hit 92% by month end.
            </div>
            <div className="student-list-item">
              <div className="student-info">
                <div className="student-name">At Risk Revenue</div>
                <div className="student-sub">High probability of default</div>
              </div>
              <div className="student-score" style={{fontSize: '16px'}}>₹3.2L</div>
            </div>
          </div>

          <div className="widget-card animate-on-scroll stagger-2">
            <div className="widget-header">
              <span className="widget-role">PRINCIPAL</span>
              <span className="widget-badge badge-critical">Action Needed</span>
            </div>
            <h3 className="widget-title">Critical Risk Students</h3>
            <div className="widget-metric metric-red">5</div>
            <div className="widget-content">
              Students identified with critical dropout risk due to attendance and fee delays.
            </div>
            <div className="student-list-item" style={{marginTop: '16px'}}>
              <div className="student-avatar" style={{background: '#FEF2F2', color: '#DC2626'}}>SR</div>
              <div className="student-info">
                <div className="student-name">Suresh Reddy</div>
                <div className="student-sub">Absent 14 days</div>
              </div>
              <div className="student-score">85</div>
            </div>
            <div className="widget-actions">
              <button className="btn-widget btn-widget-primary">Draft Interventions</button>
            </div>
          </div>

          <div className="widget-card animate-on-scroll stagger-3">
            <div className="widget-header">
              <span className="widget-role">TEACHER</span>
              <span className="widget-badge badge-success">High Confidence</span>
            </div>
            <h3 className="widget-title">Class Performance</h3>
            <div className="widget-metric metric-green">86%</div>
            <div className="widget-content">
              Homework completion rate for Grade 9A.
            </div>
            <div className="student-list-item" style={{marginTop: '16px'}}>
              <div className="student-info">
                <div className="student-name">Attention Required</div>
                <div className="student-sub">Arjun missed 3 consecutive assignments</div>
              </div>
            </div>
            <div className="widget-actions">
              <button className="btn-widget btn-widget-outline">View Details</button>
            </div>
          </div>

          <div className="widget-card animate-on-scroll stagger-4">
            <div className="widget-header">
              <span className="widget-role">ACCOUNTANT</span>
              <span className="widget-badge badge-critical">Overdue</span>
            </div>
            <h3 className="widget-title">Priority Follow-ups</h3>
            <div className="student-list-item">
              <div className="student-avatar">SF</div>
              <div className="student-info">
                <div className="student-name">Sharma Family</div>
                <div className="student-sub">47 days overdue</div>
              </div>
              <div className="student-score" style={{fontSize: '16px', color: '#0F172A'}}>₹8,400</div>
            </div>
            <div className="student-list-item">
              <div className="student-avatar">RF</div>
              <div className="student-info">
                <div className="student-name">Reddy Family</div>
                <div className="student-sub">39 days overdue</div>
              </div>
              <div className="student-score" style={{fontSize: '16px', color: '#0F172A'}}>₹6,200</div>
            </div>
            <div className="widget-actions">
              <button className="btn-widget btn-widget-primary">Send Reminders</button>
            </div>
          </div>

          <div className="widget-card animate-on-scroll stagger-5">
            <div className="widget-header">
              <span className="widget-role">PARENT</span>
              <span className="widget-badge badge-success">Improving</span>
            </div>
            <h3 className="widget-title">Arjun's Week</h3>
            <div className="widget-metric metric-green" style={{fontSize: '32px'}}>Rank 12</div>
            <div className="widget-content">
              Up from Rank 17 last month. Excellent progress in Mathematics.
            </div>
            <div className="student-list-item" style={{marginTop: '16px'}}>
              <div className="student-info">
                <div className="student-name">Tomorrow's Prep</div>
                <div className="student-sub">Science project due &bull; Sports uniform</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section architecture-section">
        <div className="container">
          <h2 className="section-title animate-on-scroll" style={{textAlign: 'center', margin: '0 auto 80px auto'}}>How Kairos Works</h2>
          
          <div className="arch-diagram animate-on-scroll stagger-1" style={{position: 'relative'}}>
            <div style={{position: 'relative', width: '100%', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '48px', zIndex: 2}}>
              {/* SVG arrows (desktop only) */}
              <div className="arch-svg-arrows hidden md:block">
                <svg viewBox="0 0 1000 293" style={{width: '100%', height: '100%'}}>
                  <defs>
                    <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
                      <polygon points="0 0, 6 3, 0 6" fill="#CBD5E1" />
                    </marker>
                  </defs>
                  <g stroke="#CBD5E1" strokeWidth="1.5" fill="none" markerEnd="url(#arrowhead)">
                    <path d="M 180,52 L 340,98" />
                    <path d="M 340,52 L 420,98" />
                    <path d="M 500,52 L 500,98" />
                    <path d="M 660,52 L 580,98" />
                    <path d="M 820,52 L 660,98" />
                    <path d="M 340,193 L 180,239" />
                    <path d="M 420,193 L 340,239" />
                    <path d="M 500,193 L 500,239" />
                    <path d="M 580,193 L 660,239" />
                    <path d="M 660,193 L 820,239" />
                  </g>
                  <g stroke="#2563EB" strokeWidth="2" fill="none" className="svg-pulse">
                    <path d="M 180,52 L 340,98" />
                    <path d="M 340,52 L 420,98" />
                    <path d="M 500,52 L 500,98" />
                    <path d="M 660,52 L 580,98" />
                    <path d="M 820,52 L 660,98" />
                    <path d="M 340,193 L 180,239" />
                    <path d="M 420,193 L 340,239" />
                    <path d="M 500,193 L 500,239" />
                    <path d="M 580,193 L 660,239" />
                    <path d="M 660,193 L 820,239" />
                  </g>
                </svg>
              </div>
              
              <div className="arch-row">
                <div className="arch-box">Attendance</div>
                <div className="arch-box">Fees</div>
                <div className="arch-box">Marks</div>
                <div className="arch-box">Homework</div>
                <div className="arch-box">Diary</div>
              </div>
              
              <div className="arch-arrow"></div>
              
              <div className="arch-row">
                <div className="arch-box engine">
                  <div style={{fontSize: '20px', marginBottom: '8px', color: '#fff'}}>Kairos AI Engine</div>
                  <div style={{color: '#94A3B8', fontSize: '13px', letterSpacing: '1px'}}>RISK SCORING &middot; INSIGHT GENERATION &middot; NL QUERY</div>
                </div>
              </div>
              
              <div className="arch-arrow"></div>
              
              <div className="arch-row">
                <div className="arch-box" style={{borderTop: '3px solid #2563EB'}}>Owner</div>
                <div className="arch-box" style={{borderTop: '3px solid #2563EB'}}>Principal</div>
                <div className="arch-box" style={{borderTop: '3px solid #2563EB'}}>Teacher</div>
                <div className="arch-box" style={{borderTop: '3px solid #2563EB'}}>Accountant</div>
                <div className="arch-box" style={{borderTop: '3px solid #2563EB'}}>Parent</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section container">
        <div className="tech-columns">
          <div className="animate-on-scroll">
            <h2 className="section-title" style={{marginBottom: '32px'}}>Architected for Scale.<br/>Built for Speed.</h2>
            <p className="tech-text">
              Kairos is powered by a bleeding-edge serverless architecture. We ingest, process, and analyze massive amounts of school data in real-time with zero latency&mdash;delivering military-grade security and uncompromising performance at any scale.
            </p>
          </div>
          <div className="tech-grid animate-on-scroll stagger-1">
            <div className="tech-badge">Next.js 14</div>
            <div className="tech-badge">React</div>
            <div className="tech-badge">TypeScript</div>
            <div className="tech-badge">Supabase</div>
            <div className="tech-badge">PostgreSQL</div>
            <div className="tech-badge">Row Level Security</div>
            <div className="tech-badge">OpenAI API</div>
            <div className="tech-badge">Groq</div>
            <div className="tech-badge">TailwindCSS</div>
            <div className="tech-badge">Vercel</div>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="container animate-on-scroll">
          <div className="cta-panel">
            <div className="cta-glow"></div>
            <h2 className="cta-title">See what <span className="text-gradient">Kairos</span> knows<br/>about your school</h2>
            <p className="cta-sub">Live demo. Real data. 600 students.</p>
            <Link href="/login" className="btn-cta">Open Kairos &rarr;</Link>
            
            <div className="demo-credentials">
              <div className="demo-credentials-title">Demo Credentials</div>
              <div className="credentials-grid">
                <div className="cred-item">
                  <span className="cred-role">Owner</span>
                  <span className="cred-email">owner@scis.edu</span>
                  <span className="cred-pass">Owner@123</span>
                </div>
                <div className="cred-item">
                  <span className="cred-role">Principal</span>
                  <span className="cred-email">principal@scis.edu</span>
                  <span className="cred-pass">Principal@123</span>
                </div>
                <div className="cred-item">
                  <span className="cred-role">Teacher</span>
                  <span className="cred-email">teacher@scis.edu</span>
                  <span className="cred-pass">Teacher@123</span>
                </div>
                <div className="cred-item">
                  <span className="cred-role">Accountant</span>
                  <span className="cred-email">accountant@scis.edu</span>
                  <span className="cred-pass">Accountant@123</span>
                </div>
                <div className="cred-item">
                  <span className="cred-role">Parent</span>
                  <span className="cred-email">parent@scis.edu</span>
                  <span className="cred-pass">Parent@123</span>
                </div>
              </div>
            </div>

            <div className="cta-footer">Built at OpenAI &times; Outskill AI Builders Hackathon</div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          Kairos &middot; Built by Vipul Preetham &middot; <a href="https://kairos.vipulpreetham.me">kairos.vipulpreetham.me</a>
        </div>
      </footer>
    </>
  );
}
