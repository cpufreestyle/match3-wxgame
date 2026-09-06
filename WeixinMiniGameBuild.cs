using UnityEngine;
using UnityEditor;
using UnityEditor.Build.Reporting;
using System.IO;

// 微信小游戏构建脚本 - 由 Tuanjie 命令行调用
public static class WeixinMiniGameBuild
{
    public static void Build()
    {
        // 配置包名与版本（与 Android 保持一致）
        PlayerSettings.productName = "PuzzleGame";
        PlayerSettings.bundleVersion = "1.2.0";

        // 竖屏
        PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;

        // 切换到微信小游戏构建目标
        EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTarget.WeixinMiniGame);

        // 场景
        string[] scenes = { "Assets/Scenes/game.unity" };
        if (!File.Exists(scenes[0]))
        {
            // 找任意场景
            string[] guids = AssetDatabase.FindAssets("t:SceneAsset");
            if (guids.Length > 0)
            {
                scenes = new string[] { AssetDatabase.GUIDToAssetPath(guids[0]) };
                Debug.Log("Using scene: " + scenes[0]);
            }
        }

        // 输出（目录内含 game.js/game.json，可直接用微信开发者工具打开）
        string outputPath = "Builds/WeixinMiniGame";
        Directory.CreateDirectory(outputPath);

        // 构建
        BuildPlayerOptions options = new BuildPlayerOptions
        {
            scenes = scenes,
            locationPathName = outputPath,
            target = BuildTarget.WeixinMiniGame,
            options = BuildOptions.None
        };

        BuildReport report = BuildPipeline.BuildPlayer(options);
        if (report.summary.result == BuildResult.Succeeded)
        {
            Debug.Log("✅ BUILD SUCCESS: " + outputPath);
            Debug.Log("Size: " + report.summary.totalSize / (1024*1024) + " MB");
        }
        else
        {
            Debug.LogError("❌ BUILD FAILED: " + report.summary.result);
            EditorApplication.Exit(1);
        }
        EditorApplication.Exit(0);
    }
}
