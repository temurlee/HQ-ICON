import { Component, createRef } from "react";
import { createPortal } from "react-dom";
import { getScreenshotGroups } from "./searchApp.js";
import "./materialPanel.css";

const sanitizeName = (name) =>
  name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "app";

const getExtension = (url) => {
  const match = url.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
  return match ? match[1].toLowerCase() : "jpg";
};

class MaterialPanel extends Component {
  constructor(props) {
    super(props);
    this.dialogRef = createRef();
    this.state = { downloads: {} };
  }

  componentDidMount() {
    this.dialogRef.current?.showModal();
  }

  handleBackdropClick = (event) => {
    if (event.target === this.dialogRef.current) {
      this.dialogRef.current.close();
    }
  };

  downloadScreenshot = async (key, downloadUrl, filename) => {
    this.setState((prev) => ({
      downloads: {
        ...prev.downloads,
        [key]: { loading: true, failed: false },
      },
    }));
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      this.setState((prev) => ({
        downloads: {
          ...prev.downloads,
          [key]: { loading: false, failed: false },
        },
      }));
    } catch {
      this.setState((prev) => ({
        downloads: {
          ...prev.downloads,
          [key]: { loading: false, failed: true },
        },
      }));
    }
  };

  render() {
    const { data, base64, downloadName, t } = this.props;
    const { trackName, artistName, kind, primaryGenreName } = data;
    const platform = kind.startsWith("mac") ? "macOS" : "iOS";
    const groups = getScreenshotGroups(data);
    const appName = sanitizeName(trackName);

    return createPortal(
      <dialog
        ref={this.dialogRef}
        className="material-dialog"
        aria-label={`${trackName} - ${t.materials}`}
        onClose={this.props.onClose}
        onClick={this.handleBackdropClick}
      >
        <div className="material-content">
          <div className="material-header">
            <div className="material-icon-wrapper">
              {base64 ? (
                <img className="material-icon" src={base64} alt={trackName} />
              ) : (
                <div className="material-icon-failed" />
              )}
            </div>
            <div className="material-meta">
              <h2 className="material-title">{trackName}</h2>
              <div className="material-artist">{artistName}</div>
              <div className="material-platform">
                {platform} - {primaryGenreName}
              </div>
              {base64 && (
                <a
                  className="material-download-icon"
                  href={base64}
                  download={downloadName}
                >
                  {t.downloadIcon}
                </a>
              )}
            </div>
            <button
              type="button"
              className="material-close"
              onClick={() => this.dialogRef.current.close()}
              aria-label={t.close}
            >
              ×
            </button>
          </div>
          <div className="material-body">
            {groups.length ? (
              groups.map((group) => (
                <section className="material-group" key={group.platform}>
                  <h3 className="material-group-title">
                    {group.platform} · {t.screenshots}
                  </h3>
                  <div className="material-screenshots">
                    {group.screenshots.map((screenshot, index) => {
                      const key = `${group.platform}-${index}`;
                      const download = this.state.downloads[key] || {};
                      const filename = `${appName}-${group.platform}-${index + 1}.${getExtension(screenshot.downloadUrl)}`;
                      return (
                        <div className="material-shot" key={key}>
                          <img
                            src={screenshot.previewUrl}
                            alt={`${trackName} ${group.platform} ${index + 1}`}
                            loading="lazy"
                          />
                          <button
                            type="button"
                            className="material-download"
                            onClick={() =>
                              this.downloadScreenshot(
                                key,
                                screenshot.downloadUrl,
                                filename,
                              )
                            }
                            disabled={download.loading}
                          >
                            {download.failed
                              ? t.downloadFailed
                              : t.download}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))
            ) : (
              <div className="material-empty">{t.noScreenshots}</div>
            )}
          </div>
        </div>
      </dialog>,
      document.body,
    );
  }
}

export default MaterialPanel;
