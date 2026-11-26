import React from 'react';
import {Composition} from 'remotion';
import {Explainer, ResolvedScene} from './Explainer';

const empty: ResolvedScene = {fps: 30, total: 5, audio: null, env: [], nodes: {}, steps: []};

export const Root: React.FC = () => (
  <Composition
    id="Explainer"
    component={Explainer}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={150}
    defaultProps={{scene: empty}}
    calculateMetadata={({props}) => ({
      durationInFrames: Math.ceil(props.scene.total * props.scene.fps),
      fps: props.scene.fps,
    })}
  />
);
