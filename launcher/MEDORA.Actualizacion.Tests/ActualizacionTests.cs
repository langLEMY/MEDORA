using System.Security.Cryptography;
using System.Text;

namespace MEDORA.Actualizacion.Tests;

public class ComparadorVersionesTests
{
    [Theory]
    [InlineData("v1.5.0", "1.4.0", true)]
    [InlineData("1.5.0", "1.4.0", true)]
    [InlineData("V2.0.0", "1.4.0", true)]
    [InlineData("v1.4.0", "1.4.0", false)]
    [InlineData("v1.4.0", "1.4.0.0", false)]
    [InlineData("v1.3.9", "1.4.0", false)]
    [InlineData("v1.4.0.1", "1.4.0", true)]
    public void HayVersionMasNueva_ComparaCorrectamente(string tag, string local, bool esperado) =>
        Assert.Equal(esperado, ComparadorVersiones.HayVersionMasNueva(tag, Version.Parse(local)));

    [Theory]
    [InlineData("")]
    [InlineData("v")]
    [InlineData("release-experimental")]
    [InlineData("v1.x.y")]
    public void HayVersionMasNueva_TagInvalido_DevuelveFalse(string tag) =>
        Assert.False(ComparadorVersiones.HayVersionMasNueva(tag, new Version(1, 0, 0)));
}

public class VerificadorHashTests
{
    private static readonly byte[] Contenido = Encoding.UTF8.GetBytes("contenido de prueba");
    private static readonly string Hash = Convert.ToHexString(SHA256.HashData(Contenido));

    [Fact]
    public void Coincide_HashCorrecto() => Assert.True(VerificadorHash.Coincide(Contenido, Hash));

    [Fact]
    public void Coincide_HashEnMinusculas() => Assert.True(VerificadorHash.Coincide(Contenido, Hash.ToLowerInvariant()));

    [Fact]
    public void Coincide_FormatoSha256sum() =>
        Assert.True(VerificadorHash.Coincide(Contenido, $"{Hash}  MEDORA-1.0.0-Setup-x64.exe\n"));

    [Fact]
    public void NoCoincide_ContenidoAlterado() =>
        Assert.False(VerificadorHash.Coincide(Encoding.UTF8.GetBytes("otro"), Hash));

    [Fact]
    public void NoCoincide_HashVacio() => Assert.False(VerificadorHash.Coincide(Contenido, string.Empty));
}

public class InterpretarReleaseTests
{
    private static ReleaseGitHub Release(string tag, bool draft = false, bool pre = false, params string[] assets) =>
        new(tag, "Notas", draft, pre, assets.Select(a => new AssetGitHub(a, $"https://example.test/{a}")).ToList());

    [Fact]
    public void ReleaseValido_DevuelveInfo()
    {
        var info = ServicioActualizacion.InterpretarRelease(
            Release("v1.2.0", assets: ["MEDORA-1.2.0-Setup-x64.exe", "MEDORA-1.2.0-Setup-x64.exe.sha256"]),
            new Version(1, 1, 0));

        Assert.NotNull(info);
        Assert.Equal("MEDORA-1.2.0-Setup-x64.exe", info.NombreArchivo);
    }

    [Fact]
    public void SinHash_NoOfrece() =>
        Assert.Null(ServicioActualizacion.InterpretarRelease(
            Release("v1.2.0", assets: ["MEDORA-1.2.0-Setup-x64.exe"]), new Version(1, 1, 0)));

    [Fact]
    public void Prerelease_NoOfrece() =>
        Assert.Null(ServicioActualizacion.InterpretarRelease(
            Release("v1.2.0", pre: true, assets: ["MEDORA-1.2.0-Setup-x64.exe", "MEDORA-1.2.0-Setup-x64.exe.sha256"]),
            new Version(1, 1, 0)));

    [Fact]
    public void MismaVersion_NoOfrece() =>
        Assert.Null(ServicioActualizacion.InterpretarRelease(
            Release("v1.1.0", assets: ["MEDORA-1.1.0-Setup-x64.exe", "MEDORA-1.1.0-Setup-x64.exe.sha256"]),
            new Version(1, 1, 0, 0)));
}
