Pod::Spec.new do |s|
  s.name           = 'PlanNplateShareTarget'
  s.version        = '1.0.0'
  s.summary        = 'Reads recipe links handed to PlanNplate by the native share sheets.'
  s.description    = 'Drains the App Group queue written by the PlanNplate share extension.'
  s.author         = 'PlanNplate'
  s.homepage       = 'https://plannplate.app'
  # `license` and `swift_version` are required-ish: CocoaPods warns without them
  # and some validation paths fail outright. Matching the shape of the Expo
  # module podspecs that are known to install cleanly in this project.
  s.license        = 'MIT'
  s.swift_version  = '5.9'
  s.platforms      = { :ios => '15.1' }
  # A local module has no remote to fetch from, but CocoaPods still validates
  # this key — an empty string can fail the podspec and quietly leave the module
  # out of the build, which presents as "the app just ignores shares".
  s.source         = { :git => 'https://github.com/plannplate/plannplate.git', :tag => s.version.to_s }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
