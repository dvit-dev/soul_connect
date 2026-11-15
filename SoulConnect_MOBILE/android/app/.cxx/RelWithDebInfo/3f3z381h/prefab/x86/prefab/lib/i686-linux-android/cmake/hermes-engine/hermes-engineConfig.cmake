if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "/Users/prabakarann/.gradle/caches/9.0.0/transforms/ada43f407e4b85950a282bd6b447973c/transformed/hermes-android-0.14.1-release/prefab/modules/hermesvm/libs/android.x86/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/prabakarann/.gradle/caches/9.0.0/transforms/ada43f407e4b85950a282bd6b447973c/transformed/hermes-android-0.14.1-release/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

