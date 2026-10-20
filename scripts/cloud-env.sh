#!/usr/bin/env bash
# Source this file in the cloud machine. A local JDK/SDK installation is retained
# under /workspace/.tools and must not be mistaken for a live process.
export JAVA_HOME="${JAVA_HOME:-/workspace/.tools/jdk-21.0.8+9}"
export ANDROID_HOME="${ANDROID_HOME:-/workspace/.tools/android-sdk}"
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-/workspace/.tools/android-user}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-/workspace/.tools/gradle-home}"
export npm_config_cache="${npm_config_cache:-/workspace/.tools/npm-cache}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
mkdir -p "$ANDROID_USER_HOME" "$GRADLE_USER_HOME"
