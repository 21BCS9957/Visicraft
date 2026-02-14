'use client';

import React from "react";
import { FullScreenScrollFX } from "@/components/ui/full-screen-scroll-fx";

const sections = [
  {
    leftLabel: "Ideation",
    title: "Imagine",
    rightLabel: "Vision",
    background: "/New Section/thumbnail-1770770109838.png",
    header: "AI Powered",
  },
  {
    leftLabel: "Transform",
    title: "Basic to Selling",
    rightLabel: "Creative",
    background: "/New Section/soda Creative .png",
    header: "Creatives That Drive Sales",
  },
  {
    leftLabel: "Enhancement",
    title: "Blur to Crystal",
    rightLabel: "Clear",
    background: "/New Section/Blur to Unblur.png",
    header: "Enhance Quality",
  },
  {
    leftLabel: "Viral",
    title: "Thumbnail Magic",
    rightLabel: "Clicks",
    background: "/New Section/Thumbnail.png",
    header: "Thumbnails That Go Viral",
  },
];

export default function CreativeProcess() {
  return (
    <FullScreenScrollFX
      sections={sections}
      header={
        <>
          <div>Visicraft</div>
        </>
      }
      showProgress
      durations={{ change: 0.7, snap: 800 }}
      colors={{
        text: "rgba(245,245,245,0.92)",
        overlay: "rgba(0,0,0,0.25)",
        pageBg: "#000000",
        stageBg: "#000000",
      }}
    />
  );
}
