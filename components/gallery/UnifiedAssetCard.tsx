import AssetCard, { FeCard, LpcCard, LpcGroupCard } from 'components/gallery/AssetCard';
import { collectLpcBodyTypes } from 'app/lpcLayers';
import { toPublicAssetUrl } from 'app/assetUrl';
import type { Asset, AnimationSpec, ResolvedFeSpec, ResolvedLpcSpec } from 'app/models/Asset';

function isAnimationSpec(value: AnimationSpec | ResolvedFeSpec | ResolvedLpcSpec | undefined): value is AnimationSpec {
  return Boolean(value && typeof value === 'object' && 'id' in value);
}

function isResolvedLpcSpec(value: AnimationSpec | ResolvedFeSpec | ResolvedLpcSpec | undefined): value is ResolvedLpcSpec {
  return Boolean(value && typeof value === 'object' && !('id' in value));
}

interface UnifiedAssetCardProps {
  asset: Asset;
  resolvedSpec?: AnimationSpec | ResolvedFeSpec | ResolvedLpcSpec;
  animName?: string;
  bodyType?: string;
  groupAnimNames?: string[];
}

export default function UnifiedAssetCard({ asset, resolvedSpec, animName, bodyType, groupAnimNames }: UnifiedAssetCardProps) {
  const hasPreview = Boolean(toPublicAssetUrl(asset.preview));

  if (asset.type === 'lpc' && asset.animations?.length) {
    const lpcSpec = isResolvedLpcSpec(resolvedSpec) ? resolvedSpec : undefined;
    const selectedAnim = animName ?? asset.animations[0];
    const fallbackTypes = asset.body_types?.length ? asset.body_types : collectLpcBodyTypes(asset.layers);
    const selectedBodyType = bodyType || fallbackTypes[0];

    if (groupAnimNames?.length && lpcSpec) {
      const validAnimNames = groupAnimNames.filter((name) => lpcSpec[name]);
      if (validAnimNames.length > 1) {
        return (
          <LpcGroupCard
            asset={asset}
            animNames={validAnimNames}
            specs={validAnimNames.map((name) => lpcSpec[name])}
            bodyType={selectedBodyType}
            backgroundLayers={asset.context_layers}
            allAnimSpecs={lpcSpec}
          />
        );
      }

      if (validAnimNames.length === 1) {
        const fallbackAnimName = validAnimNames[0];
        return (
          <LpcCard
            asset={asset}
            animName={fallbackAnimName}
            bodyType={selectedBodyType}
            backgroundLayers={asset.context_layers}
            animSpec={lpcSpec[fallbackAnimName]}
            allAnimSpecs={lpcSpec}
          />
        );
      }

      return hasPreview ? <AssetCard asset={asset} /> : null;
    }

    const animSpec = isAnimationSpec(resolvedSpec)
      ? resolvedSpec
      : (lpcSpec && selectedAnim ? lpcSpec[selectedAnim] : undefined);

    if (!animSpec || !selectedAnim) {
      return hasPreview ? <AssetCard asset={asset} /> : null;
    }

    return (
      <LpcCard
        asset={asset}
        animName={selectedAnim}
        bodyType={selectedBodyType}
        backgroundLayers={asset.context_layers}
        animSpec={animSpec}
        allAnimSpecs={lpcSpec}
      />
    );
  }

  if (asset.type === 'fe') {
    return <FeCard asset={asset} feSpec={resolvedSpec as ResolvedFeSpec | undefined} />;
  }

  return <AssetCard asset={asset} />;
}
