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
    this.state = { downloads: {}, materials: null };
  }

  componentDidMount() {
    this.dialogRef.current?.showModal();
    this.loadMaterials();
  }

  async loadMaterials() {
    const { data, country } = this.props;
    if (!data.trackId) return;

    try {
      const res = await fetch(
        `./api/appstore-materials?id=${encodeURIComponent(data.trackId)}&country=${encodeURIComponent(country || "us")}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const materials = await res.json();
      this.setState({
        materials: {
          hero: materials?.hero || null,
          topics: Array.isArray(materials?.topics) ? materials.topics : [],
        },
      });
    } catch {
      this.setState({ materials: null });
    }
  }

  handleBackdropClick = (event) => {
    if (event.target === this.dialogRef.current) {
      this.dialogRef.current.close();
    }
  };

  downloadAsset = async (key, downloadUrl, filename) => {
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
    const { downloads, materials } = this.state;
    const hero = materials?.hero || null;
    const topics = materials?.topics || [];
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
            {(hero || topics.length > 0) && (
              <section className="material-featured">
                <h3 className="material-group-title">{t.featuredMaterials}</h3>
                {hero && (
                  <div className="material-hero">
                    <img
                      src={hero.previewUrl}
                      alt={`${trackName} ${t.heroArtwork}`}
                    />
                    <button
                      type="button"
                      className="material-download"
                      onClick={() =>
                        this.downloadAsset(
                          "hero",
                          hero.downloadUrl,
                          `${appName}-${t.heroArtwork}.${getExtension(hero.downloadUrl)}`,
                        )
                      }
                      disabled={(downloads.hero || {}).loading}
                    >
                      {(downloads.hero || {}).failed
                        ? t.downloadFailed
                        : t.download}
                    </button>
                  </div>
                )}
                {topics.length > 0 && (
                  <>
                    <h4 className="material-subtitle">{t.relatedTopics}</h4>
                    <div className="material-topics">
                      {topics.map((topic, index) => {
                        const key = `topic-${index}`;
                        const download = downloads[key] || {};
                        const content = (
                          <>
                            <img
                              src={topic.previewUrl}
                              alt={topic.title || t.relatedTopics}
                              loading="lazy"
                            />
                            <div className="material-topic-title">
                              {topic.title || t.relatedTopics}
                            </div>
                            {topic.heading && (
                              <div className="material-topic-heading">
                                {topic.heading}
                              </div>
                            )}
                            {topic.url && (
                              <div className="material-topic-more">
                                {t.viewTopic}
                              </div>
                            )}
                          </>
                        );

                        return (
                          <div className="material-topic" key={key}>
                            {topic.url ? (
                              <a
                                className="material-topic-link"
                                href={topic.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {content}
                              </a>
                            ) : (
                              <div className="material-topic-link">
                                {content}
                              </div>
                            )}
                            <button
                              type="button"
                              className="material-download"
                              onClick={() =>
                                this.downloadAsset(
                                  key,
                                  topic.downloadUrl,
                                  `${appName}-${t.relatedTopics}-${index + 1}.${getExtension(topic.downloadUrl)}`,
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
                  </>
                )}
              </section>
            )}
            {groups.length ? (
              groups.map((group) => (
                <section className="material-group" key={group.platform}>
                  <h3 className="material-group-title">
                    {group.platform} · {t.screenshots}
                  </h3>
                  <div className="material-screenshots">
                    {group.screenshots.map((screenshot, index) => {
                      const key = `${group.platform}-${index}`;
                      const download = downloads[key] || {};
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
                              this.downloadAsset(
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
