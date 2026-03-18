#!/bin/bash

cd /Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/internal/featureflags

# 定义方法映射
declare -A method_map=(
    ["commonTestFlag()"]="commonTestFlagWrapper()"
    ["completeReactInstanceCreationOnBgThreadOnAndroid()"]="completeReactInstanceCreationOnBgThreadOnAndroidWrapper()"
    ["disableEventLoopOnBridgeless()"]="disableEventLoopOnBridgelessWrapper()"
    ["disableMountItemReorderingAndroid()"]="disableMountItemReorderingAndroidWrapper()"
    ["enableAlignItemsBaselineOnFabricIOS()"]="enableAlignItemsBaselineOnFabricIOSWrapper()"
    ["enableAndroidLineHeightCentering()"]="enableAndroidLineHeightCenteringWrapper()"
    ["enableBridgelessArchitecture()"]="enableBridgelessArchitectureWrapper()"
    ["enableCppPropsIteratorSetter()"]="enableCppPropsIteratorSetterWrapper()"
    ["enableDeletionOfUnmountedViews()"]="enableDeletionOfUnmountedViewsWrapper()"
    ["enableEagerRootViewAttachment()"]="enableEagerRootViewAttachmentWrapper()"
    ["enableEventEmitterRetentionDuringGesturesOnAndroid()"]="enableEventEmitterRetentionDuringGesturesOnAndroidWrapper()"
    ["enableFabricLogs()"]="enableFabricLogsWrapper()"
    ["enableFabricRenderer()"]="enableFabricRendererWrapper()"
    ["enableFabricRendererExclusively()"]="enableFabricRendererExclusivelyWrapper()"
    ["enableFixForViewCommandRace()"]="enableFixForViewCommandRaceWrapper()"
    ["enableGranularShadowTreeStateReconciliation()"]="enableGranularShadowTreeStateReconciliationWrapper()"
    ["enableIOSViewClipToPaddingBox()"]="enableIOSViewClipToPaddingBoxWrapper()"
    ["enableLayoutAnimationsOnAndroid()"]="enableLayoutAnimationsOnAndroidWrapper()"
    ["enableLayoutAnimationsOnIOS()"]="enableLayoutAnimationsOnIOSWrapper()"
    ["enableLongTaskAPI()"]="enableLongTaskAPICallback()"
    ["enableNewBackgroundAndBorderDrawables()"]="enableNewBackgroundAndBorderDrawablesWrapper()"
    ["enablePreciseSchedulingForPremountItemsOnAndroid()"]="enablePreciseSchedulingForPremountItemsOnAndroidWrapper()"
    ["enablePropsUpdateReconciliationAndroid()"]="enablePropsUpdateReconciliationAndroidWrapper()"
    ["enableReportEventPaintTime()"]="enableReportEventPaintTimeWrapper()"
    ["enableSynchronousStateUpdates()"]="enableSynchronousStateUpdatesWrapper()"
    ["enableUIConsistency()"]="enableUIConsistencyWrapper()"
    ["enableViewRecycling()"]="enableViewRecyclingWrapper()"
    ["excludeYogaFromRawProps()"]="excludeYogaFromRawPropsWrapper()"
    ["fixMappingOfEventPrioritiesBetweenFabricAndReact()"]="fixMappingOfEventPrioritiesBetweenFabricAndReactWrapper()"
    ["fixMountingCoordinatorReportedPendingTransactionsOnAndroid()"]="fixMountingCoordinatorReportedPendingTransactionsOnAndroidWrapper()"
    ["fuseboxEnabledDebug()"]="fuseboxEnabledDebugWrapper()"
    ["fuseboxEnabledRelease()"]="fuseboxEnabledReleaseWrapper()"
    ["initEagerTurboModulesOnNativeModulesQueueAndroid()"]="initEagerTurboModulesOnNativeModulesQueueAndroidWrapper()"
    ["lazyAnimationCallbacks()"]="lazyAnimationCallbacksWrapper()"
    ["loadVectorDrawablesOnImages()"]="loadVectorDrawablesOnImagesWrapper()"
    ["traceTurboModulePromiseRejectionsOnAndroid()"]="traceTurboModulePromiseRejectionsOnAndroidWrapper()"
    ["useAlwaysAvailableJSErrorHandling()"]="useAlwaysAvailableJSErrorHandlingWrapper()"
    ["useFabricInterop()"]="useFabricInteropWrapper()"
    ["useImmediateExecutorInAndroidBridgeless()"]="useImmediateExecutorInAndroidBridgelessWrapper()"
    ["useNativeViewConfigsInBridgelessMode()"]="useNativeViewConfigsInBridgelessModeWrapper()"
    ["useOptimisedViewPreallocationOnAndroid()"]="useOptimisedViewPreallocationOnAndroidWrapper()"
    ["useOptimizedEventBatchingOnAndroid()"]="useOptimizedEventBatchingOnAndroidWrapper()"
    ["useRuntimeShadowNodeReferenceUpdate()"]="useRuntimeShadowNodeReferenceUpdateWrapper()"
    ["useTurboModuleInterop()"]="useTurboModuleInteropWrapper()"
    ["useTurboModules()"]="useTurboModulesWrapper()"
    ["override(provider as Any)"]="overrideWrapper(provider as Any)"
    ["dangerouslyReset()"]="dangerouslyResetWrapper()"
    ["dangerouslyForceOverride(provider as Any)"]="dangerouslyForceOverrideWrapper(provider as Any)"
)

# 应用所有替换
for old in "${!method_map[@]}"; do
    new="${method_map[$old]}"
    sed -i '' "s/ReactNativeFeatureFlagsCxxInterop\\.${old}/ReactNativeFeatureFlagsCxxInterop.${new}/g" ReactNativeFeatureFlagsCxxAccessor.kt
done

echo "✅ 所有方法调用已更新为 wrapper 版本"
