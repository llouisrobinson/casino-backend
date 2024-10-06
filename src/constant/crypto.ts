import { IS_MAINNET } from "@/config";

export const CDENOM_TOKENS = {
  usk: IS_MAINNET
    ? "factory/kujira1qk00h5atutpsv900x202pxx42npjr9thg58dnqpa72f2p7m2luase444a7/uusk"
    : "factory/kujira1sr9xfmzc8yy5gz00epspscxl0zu7ny02gv94rx/kartelUSk",
  kart: IS_MAINNET
    ? "factory/kujira13x2l25mpkhwnwcwdzzd34cr8fyht9jlj7xu9g4uffe36g3fmln8qkvm3qn/ukart"
    : "factory/kujira1sr9xfmzc8yy5gz00epspscxl0zu7ny02gv94rx/kartel",
};
