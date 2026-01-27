import {
  AnyJSBundleProvider,
  ComponentBuilderContext,
  FileJSBundleProvider,
  MetroJSBundleProvider,
  ResourceJSBundleProvider,
  RNApp,
  RNOHErrorDialog,
  RNOHLogger,
  TraceJSBundleProviderDecorator,
  RNOHCoreContext
} from '@rnoh/react-native-openharmony';
import { createRNPackages } from '../RNPackagesFactory';

@Builder
export function buildCustomRNComponent(ctx: ComponentBuilderContext) {}

const wrappedCustomRNComponentBuilder = wrapBuilder(buildCustomRNComponent)

@Entry
@Component
struct Index {
  @StorageLink('RNOHCoreContext') private rnohCoreContext: RNOHCoreContext | undefined = undefined
  @State private shouldShow: boolean = false
  private shadowPath: string = "bundle.harmony.js"

  aboutToAppear() {
    this.shouldShow = true
  }

  onBackPress(): boolean | undefined {
    return undefined
  }

  build() {
    Column() {
      if (this.rnohCoreContext && this.shouldShow) {
        if (this.rnohCoreContext?.isDebugModeEnabled) {
          RNOHErrorDialog({ ctx: this.rnohCoreContext })
        }
        RNApp({
          rnInstanceConfig: {
            createRNPackages,
            enableBackgroundMessaging: false,
            enableNDKTextMeasuring: true,
            enableCustomComponentImageWriteBack: false,
            buildCustomComponent: wrappedCustomRNComponentBuilder,
          },
          initialProps: {},
          appKey: "SoundTherapyApp",
          jsBundleProvider: new TraceJSBundleProviderDecorator(
            new AnyJSBundleProvider([
              new MetroJSBundleProvider(),
              new FileJSBundleProvider(this.shadowPath),
              new ResourceJSBundleProvider('bundle.harmony.js')
            ]),
            this.rnohCoreContext.logger
          ),
        })
      }
    }
    .height('100%')
    .width('100%')
  }
}
